const express = require('express');
const axios = require('axios');
const querystring = require('querystring');

const app = express();
app.use(express.json());

const API_KEY = '34be68218a5f4f91ba80db4c7b13b5d988699a9ce29d41188e976ad';
const API_OWNER = 'test';

// Your updated custom endpoint path
app.post('/RestWS/api/eretail/v1/custom/order/return', async (req, res) => {
    try {
        const incomingPayload = req.body;
        const forwardOrderCode = incomingPayload.forwardOrderCode;
        const returnOrderCode = incomingPayload.returnOrderCode;

        if (!forwardOrderCode) {
            return res.status(400).json({ error: "Missing forwardOrderCode" });
        }

        console.log(`Processing Order: ${forwardOrderCode}`);

        // 1. Get Shipment Details from Vinculum
        const shipmentResponse = await axios.post(
            'https://crocsuat.vineretail.com/RestWS/api/eretail/v1/order/shipmentDetail',
            { order_no: [forwardOrderCode], filterBy: "" },
            { headers: { 'Content-Type': 'application/json', 'ApiKey': API_KEY, 'ApiOwner': API_OWNER } }
        );

        const orderData = shipmentResponse.data?.orders?.[0];
        if (!orderData || !orderData.shipdetail || orderData.shipdetail.length === 0) {
            return res.status(404).json({ error: "No shipment details found." });
        }

        const shipDetail = orderData.shipdetail[0];
        const trackingNo = shipDetail.tracking_number || "";
        
        const incomingItem = incomingPayload.orderItems?.[0];
        const incomingSku = incomingItem?.channelSkuCode;
        
        let foundExtLineNo = "";
        if (shipDetail.item && shipDetail.item.length > 0) {
            const matchedItem = shipDetail.item.find(i => i.sku === incomingSku);
            if (matchedItem) foundExtLineNo = matchedItem.extLineNo || "";
        }

        const formattedDate = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' }).replace(',', '');

        // 2. Build updated Vinculum Return Object with your new mappings
        const vinculumReturnPayload = {
            orderReturn: [
                {
                    requestType: "Request",
                    returnType: "Delivered Return",
                    order_location: incomingPayload.locationCode || "3084",
                    order_no: forwardOrderCode,
                    tracking_no: trackingNo,
                    status: "Confirmed",
                    custRetCode: returnOrderCode || "",       // Mapped from returnOrderCode
                    extCustRetCode: returnOrderCode || "",    // Mapped from returnOrderCode
                    return_date: formattedDate,
                    remarks: incomingPayload.returnReason || "",
                    category: "Refund",
                    items: [
                        {
                            ext_lineno: foundExtLineNo,
                            sku: incomingSku || "",
                            return_reason: incomingItem?.reason || "", // Mapped from item's reason
                            return_qty: "1"
                        }
                    ]
                }
            ]
        };

        const formData = querystring.stringify({
            RequestBody: JSON.stringify(vinculumReturnPayload),
            ApiOwner: API_OWNER,
            ApiKey: API_KEY
        });

        // 3. Request Return Creation
        const finalReturnResponse = await axios.post(
            'https://crocsuat.vineretail.com/RestWS/api/eretail/v1/order/return',
            formData,
            { headers: { 'accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        
        // Return exactly what Vinculum responds with
        return res.status(200).json(finalReturnResponse.data);

    } catch (error) {
        if (error.response) return res.status(error.response.status).json(error.response.data);
        return res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Live on port ${PORT}`));