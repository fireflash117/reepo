const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

// Configuration
const HUBSPOT_API_URL = "https://api.hubapi.com/crm/v3/objects/contacts";
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const PORT = process.env.PORT || 3000;

// Validate configuration
if (!HUBSPOT_TOKEN) {
  console.error("Error: HUBSPOT_TOKEN environment variable is required");
  process.exit(1);
}

// Axios configuration
const axiosConfig = {
  headers: {
    Authorization: `Bearer ${HUBSPOT_TOKEN}`,
    Accept: "application/json",
    "Content-Type": "application/json"
  }
};

// Helper functions
const handleHubSpotError = (error) => {
  console.error("HubSpot API Error:", {
    status: error.response?.status,
    data: error.response?.data,
    message: error.message
  });
  throw new Error(error.response?.data?.message || "HubSpot API request failed");
};

// Get contacts with pagination
const getContacts = async () => {
  try {
    let allContacts = [];
    let after = null;
    let hasMore = true;

    while (hasMore) {
      const params = {
        properties: "firstname,lastname,email",
        limit: 100
      };
      
      if (after) params.after = after;

      const res = await axios.get(`${HUBSPOT_API_URL}/crm/v3/objects/contacts`, {
        ...axiosConfig,
        params
      });

      allContacts = [...allContacts, ...(res.data.results || [])];
      after = res.data.paging?.next?.after;
      hasMore = !!after;
    }

    return allContacts;
  } catch (error) {
    handleHubSpotError(error);
  }
};

// Get deals with pagination
const getDeals = async () => {
  try {
    let allDeals = [];
    let after = null;
    let hasMore = true;

    while (hasMore) {
      const params = {
        properties: "dealname,amount,dealstage",
        limit: 100
      };
      
      if (after) params.after = after;

      const res = await axios.get(`${HUBSPOT_API_URL}/crm/v3/objects/deals`, {
        ...axiosConfig,
        params
      });

      allDeals = [...allDeals, ...(res.data.results || [])];
      after = res.data.paging?.next?.after;
      hasMore = !!after;
    }

    return allDeals;
  } catch (error) {
    handleHubSpotError(error);
  }
};

// Associate deal with contact
const assignDeal = async (dealId, contactId) => {
  try {
    await axios.put(
      `${HUBSPOT_API_URL}/crm/v3/objects/deals/${dealId}/associations/contacts/${contactId}/deal_to_contact`,
      {},
      axiosConfig
    );
    return true;
  } catch (error) {
    handleHubSpotError(error);
  }
};

// Webhook endpoint
app.post("/webhook", async (req, res) => {
  try {
    const tag = req.body.fulfillmentInfo?.tag;
    const parameters = req.body.sessionInfo?.parameters || {};
    
    let response = {
      sessionInfo: { parameters: {} },
      fulfillmentResponse: { messages: [] }
    };

    switch (tag) {
      case "getContacts":
        const contacts = await getContacts();
        const topContacts = contacts.slice(0, 5); // Show only 5 contacts
        
        response.sessionInfo.parameters.hubspotContacts = topContacts;
        response.fulfillmentResponse.messages.push({
          text: {
            text: [
              "Here are your top 5 HubSpot contacts:\n" +
              topContacts.map((c, i) => 
                `${i+1}. ${c.properties.firstname} ${c.properties.lastname} (${c.id})`
              ).join("\n") +
              "\nPlease select a number (1-5) to choose a contact."
            ]
          }
        });
        break;

      case "getDeals":
        const deals = await getDeals();
        const topDeals = deals.slice(0, 5); // Show only 5 deals
        
        response.sessionInfo.parameters.hubspotDeals = topDeals;
        response.fulfillmentResponse.messages.push({
          text: {
            text: [
              "Here are your top 5 HubSpot deals:\n" +
              topDeals.map((d, i) => 
                `${i+1}. ${d.properties.dealname} - $${d.properties.amount || 0} (${d.id})`
              ).join("\n") +
              "\nPlease select a number (1-5) to choose a deal."
            ]
          }
        });
        break;

      case "assignDeal":
        const { selectedContact, selectedDeal } = parameters;
        
        if (!selectedContact?.id || !selectedDeal?.id) {
          throw new Error("Missing contact or deal ID");
        }

        await assignDeal(selectedDeal.id, selectedContact.id);
        
        response.fulfillmentResponse.messages.push({
          text: {
            text: [
              `Success! Deal "${selectedDeal.properties.dealname}" has been assigned to ` +
              `contact ${selectedContact.properties.firstname} ${selectedContact.properties.lastname}.`
            ]
          }
        });
        break;

      default:
        response.fulfillmentResponse.messages.push({
          text: { text: ["I didn't understand that request. Please try again."] }
        });
    }

    res.json(response);

  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({
      fulfillmentResponse: {
        messages: [{
          text: { text: [`Error: ${error.message}`] }
        }]
      }
    });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy", timestamp: new Date() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Webhook server running on port ${PORT}`);
  console.log(`HubSpot API base URL: ${HUBSPOT_API_URL}`);
});
