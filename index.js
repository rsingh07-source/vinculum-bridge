const express = require('express');
const axios = require('axios');
const querystring = require('querystring');

const app = express();
app.use(express.json());

const API_KEY = '34be68218a5f4f91ba80db4c7b13b5d988699a9ce29d41188e976ad';
const API_OWNER = 'test';

// This is your custom hosted endpoint
app.post('/RestWS/api/eretail/v1/custom/order/return', async (req, res) => {
    try {
        const incomingPayload = req.body;
        const forwardOrderCode = incomingPayload.forwardOrderCode;

        if (!forwardOrderCode) {
            return res.status(400).json({ error: "Missing forwardOrderCode in request payload." });
        }

        console.log(`Step 1: Received return request for Order: ${forwardOrderCode}`);

        // --- STEP 2: CALL SHIPMENT DETAIL API ---
        console.log("Step 2: Fetching shipment details from Vinculum...");
        const shipmentResponse = await axios.post(
            'https://crocsuat.vineretail.com/RestWS/api/eretail/v1/order/shipmentDetail',
            {
                order_no: [forwardOrderCode],
                filterBy: ""
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'ApiKey': API_KEY,
                    'ApiOwner': API_OWNER
                }
            }
        );

        // --- STEP 3: EXTRACT TRACKING NUMBER AND EXT_LINE_NO ---
        const orderData = shipmentResponse.data?.orders?.[0];
        if (!orderData || !orderData.shipdetail || orderData.shipdetail.length === 0) {
            return res.status(404).json({ error: "No shipment details found for this order number in Vinculum." });
        }

        const shipDetail = orderData.shipdetail[0];
        const trackingNo = shipDetail.tracking_number || "";
        
        // Match line items based on SKU to get the correct extLineNo
        const incomingItem = incomingPayload.orderItems?.[0];
        const incomingSku = incomingItem?.channelSkuCode;
        
        let foundExtLineNo = "";
        if (shipDetail.item && shipDetail.item.length > 0) {
            const matchedItem = shipDetail.item.find(i => i.sku === incomingSku);
            if (matchedItem) {
                foundExtLineNo = matchedItem.extLineNo || "";
            }
        }

        console.log(`Step 3 Extracted: Tracking No = ${trackingNo}, ExtLineNo = ${foundExtLineNo}`);

        // Helper to format date into DD/MM/YYYY HH:MM:SS
        const formattedDate = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' }).replace(',', '');

        // --- STEP 4: BUILD THE RETURN PAYLOAD ---
        const vinculumReturnPayload = {
            orderReturn: [
                {
                    requestType: "Request",
                    returnType: "Delivered Return",
                    order_location: incomingPayload.locationCode || "3084",
                    order_no: forwardOrderCode,
                    tracking_no: trackingNo,
                    status: "Confirmed",
                    return_date: formattedDate,
                    remarks: incomingPayload.returnReason || "Received incomplete product",
                    category: "Refund",
                    items: [
                        {
                            ext_lineno: foundExtLineNo,
                            sku: incomingSku || "",
                            return_reason: incomingItem?.reason || "Received incomplete product",
                            return_qty: "1"
                        }
                    ]
                }
            ]
        };

        // Encode as x-www-form-urlencoded format
        const formData = querystring.stringify({
            RequestBody: JSON.stringify(vinculumReturnPayload),
            ApiOwner: API_OWNER,
            ApiKey: API_KEY
        });

        // --- STEP 5: SUBMIT TO RETURN API ---
        console.log("Step 4: Submitting return data to Vinculum...");
        const finalReturnResponse = await axios.post(
            'https://crocsuat.vineretail.com/RestWS/api/eretail/v1/order/return',
            formData,
            {
                headers: {
                    'accept': 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        console.log("Step 5: Process complete. Sending Vinculum response back.");
        
        // Pass Vinculum's response back exactly as is
        return res.status(200).json(finalReturnResponse.data);

    } catch (error) {
        console.error("Workflow failed:", error.message);
        if (error.response) {
            return res.status(error.response.status).json(error.response.data);
        }
        return res.status(500).json({ error: error.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`App listening on port ${PORT}`));