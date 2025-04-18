const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

// Configuration
const HUBSPOT_API_URL = "https://api.hubapi.com";
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const PORT = process.env.PORT || 3000;

// Validate configuration
if (!HUBSPOT_TOKEN) {
  console.error("Error: HUBSPOT_TOKEN environment variable is required");
  process.exit(1);
}

// Common Axios configuration
const axiosConfig = {
  headers: {
    Authorization: `Bearer ${HUBSPOT_TOKEN}`,
    Accept: "application/json",
    "Content-Type": "application/json"
  }
};

// Helper function to handle HubSpot API errors
const handleHubSpotError = (error) => {
  console.error("HubSpot API Error:", {
    status: error.response?.status,
    data: error.response?.data,
    message: error.message
  });
  throw new Error(error.response?.data?.message || "HubSpot API request failed");
};

// Get all contacts with pagination
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
      
      if (after) {
        params.after = after;
      }

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

// Get all deals with pagination
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
      
      if (after) {
        params.after = after;
      }

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

// Associate a deal with a contact
const assignDeal = async (dealId, contactId) => {
  try {
    // Validate IDs
    if (!dealId || !contactId) {
      throw new Error("Both dealId and contactId are required");
    }

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

// Validate webhook request
const validateWebhookRequest = (req) => {
  if (!req.body || !req.body.fulfillmentInfo || !req.body.sessionInfo) {
    throw new Error("Invalid webhook request structure");
  }
};

// Webhook endpoint
app.post("/webhook", async (req, res) => {
  try {
    validateWebhookRequest(req);
    
    const tag = req.body.fulfillmentInfo.tag;
    const params = req.body.sessionInfo.parameters;

    let response;
    
    switch (tag) {
      case "getContacts":
        const contacts = await getContacts();
        const contactList = contacts.map(
          c => `${c.properties.firstname} ${c.properties.lastname} (${c.id})`
        );
        response = {
          fulfillment_response: {
            messages: [{ text: { text: [contactList.join("\n") || "No contacts found"] } }]
          }
        };
        break;
        
      case "getDeals":
        const deals = await getDeals();
        const dealList = deals.map(
          d => `${d.properties.dealname} - $${d.properties.amount || 0} (${d.id})`
        );
        response = {
          fulfillment_response: {
            messages: [{ text: { text: [dealList.join("\n") || "No deals found"] } }]
          }
        };
        break;
        
      case "assignDeal":
        const { dealId, contactId } = params;
        if (!dealId || !contactId) {
          response = {
            fulfillment_response: {
              messages: [{
                text: { text: ["Missing dealId or contactId. Please provide both."] }
              }]
            }
          };
        } else {
          await assignDeal(dealId, contactId);
          response = {
            fulfillment_response: {
              messages: [{
                text: { text: [`Deal ${dealId} successfully assigned to contact ${contactId}.`] }
              }]
            }
          };
        }
        break;
        
      default:
        response = {
          fulfillment_response: {
            messages: [{ text: { text: ["Unknown tag. No action taken."] } }]
          }
        };
    }
    
    res.json(response);
    
  } catch (error) {
    console.error("Webhook processing error:", error);
    res.status(500).json({
      fulfillment_response: {
        messages: [{
          text: { text: [`Error occurred: ${error.message}`] }
        }]
      }
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy" });
});

// Start server
app.listen(PORT, () => {
  console.log(`Webhook server running on port ${PORT}`);
  console.log(`HubSpot API base URL: ${HUBSPOT_API_URL}`);
});
