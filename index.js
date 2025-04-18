const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

const HUBSPOT_API_URL = "https://app-na2.hubspot.com/contacts/242539355/objects/0-1/views/all/list";
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;

// Get all contacts
const getContacts = async () => {
  const res = await axios.get(`${HUBSPOT_API_URL}/crm/v3/objects/contacts`, {
    headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
    params: { properties: "firstname,lastname,email" },
  });
  return res.data.results;
};

// Get all deals
const getDeals = async () => {
  const res = await axios.get(`${HUBSPOT_API_URL}/crm/v3/objects/deals`, {
    headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
    params: { properties: "dealname,amount,dealstage" },
  });
  return res.data.results;
};

// Associate a deal with a contact
const assignDeal = async (dealId, contactId) => {
  await axios.put(
    `${HUBSPOT_API_URL}/crm/v3/objects/deals/${dealId}/associations/contact/${contactId}/deal_to_contact`,
    {},
    { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
  );
};

app.post("/webhook", async (req, res) => {
  const tag = req.body.fulfillmentInfo.tag;
  const params = req.body.sessionInfo.parameters;

  try {
    if (tag === "getContacts") {
      const contacts = await getContacts();
      const contactList = contacts.map(
        (c) => `${c.properties.firstname} ${c.properties.lastname} (${c.id})`
      );
      res.json({
        fulfillment_response: {
          messages: [{ text: { text: [contactList.join("\n")] } }],
        },
      });
    } else if (tag === "getDeals") {
      const deals = await getDeals();
      const dealList = deals.map(
        (d) => `${d.properties.dealname} - $${d.properties.amount || 0} (${d.id})`
      );
      res.json({
        fulfillment_response: {
          messages: [{ text: { text: [dealList.join("\n")] } }],
        },
      });
    } else if (tag === "assignDeal") {
      const { dealId, contactId } = params;

      if (!dealId || !contactId) {
        res.json({
          fulfillment_response: {
            messages: [
              { text: { text: ["Missing dealId or contactId. Please provide both."] } },
            ],
          },
        });
        return;
      }

      await assignDeal(dealId, contactId);

      res.json({
        fulfillment_response: {
          messages: [
            { text: { text: [`Deal ${dealId} successfully assigned to contact ${contactId}.`] } },
          ],
        },
      });
    } else {
      res.json({
        fulfillment_response: {
          messages: [{ text: { text: ["Unknown tag. No action taken."] } }],
        },
      });
    }
  } catch (error) {
    console.error("Webhook error:", error.response?.data || error.message);
    res.json({
      fulfillment_response: {
        messages: [
          { text: { text: ["Error occurred while processing your request."] } },
        ],
      },
    });
  }
});

app.listen(3000, () => console.log("Webhook server running on port 3000"));
