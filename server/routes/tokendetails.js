const express   = require('express');
const router    = express.Router();
const pwaSDK    = require("../pwasdk");

const getShippingContact = (awsOrder) => {
    const orderDetails = awsOrder.GetOrderReferenceDetailsResponse.GetOrderReferenceDetailsResult.OrderReferenceDetails;
    const destinationPath = orderDetails.Destination.PhysicalDestination;
    console.log(destinationPath);

    const name =  destinationPath.Name;
    const nameSplit = name.split(/\s/);
    const firstName = nameSplit[0];
    const lastName = nameSplit[1] ? nameSplit[1] : "N/A";
    
    const phone = destinationPath.Phone;
    const contact = {
        "firstName" : firstName,
        "lastNameOrSurname" : lastName,
        "email" :  orderDetails.Buyer.Email,
        "phoneNumbers" : {
            "home" : (phone ? phone : "N/A")
        },
        "address" : {
                "address1" : destinationPath.AddressLine1,
                "address2" : destinationPath.AddressLine2,
                "cityOrTown" : destinationPath.City,
                "stateOrProvince": destinationPath.StateOrRegion,
                "postalOrZipCode": destinationPath.PostalCode,
                "countryCode": destinationPath.CountryCode,
                "addressType": "Residential",
                "isValidated": "true"
            }
        };
    console.log("Shipping contact" ,contact);
    return contact;
}

const getBillingContact = (awsOrder) => {
    const orderDetails = awsOrder.GetOrderReferenceDetailsResponse.GetOrderReferenceDetailsResult.OrderReferenceDetails;
    if (!orderDetails.BillingAddress || !orderDetails.BillingAddress.PhysicalAddress) return null;

    const address = orderDetails.BillingAddress.PhysicalAddress;
    const parts = address.Name.split(/\s/);
    const firstName = parts[0];
    const lastName = address.Name.replace(parts[0]+" ","").replace(parts[0],"");

    const contact = {
        "firstName" : firstName,
        "lastNameOrSurname" : lastName,
        "email" :  orderDetails.Buyer.Email,
        "phoneNumbers" : {
            "home" : (address.Phone  ? address.Phone  : "N/A")
        },
        "address" : {
                "address1" : address.AddressLine1,
                "address2" : address.AddressLine2,
                "cityOrTown" : address.City,
                "stateOrProvince": address.StateOrRegion,
                "postalOrZipCode": address.PostalCode,
                "countryCode": address.CountryCode,
                "addressType": "Residential",
                "isValidated": "true"
            }
        };
    console.log("Billing contact" ,contact);
    return contact;
  
}

router.post('/', async (req, res, next) => {

    //pwaSDK.configure(req.body.config);
    
    try {
        const token = req.body.token.token;
        console.log(token);
        const orderReferenceId = token.awsReferenceId;
        const addressConsentToken = token.addressAuthorizationToken;
        console.log("OrderReferenceId  " +orderReferenceId);
        console.log("Address Consent Token  " +addressConsentToken);

        const awsOrder = await pwaSDK.getOrderDetails(orderReferenceId, addressConsentToken, req.body.config);
        console.log(awsOrder);
        res.json({
            remoteConnectionStatus: "Success",
            responseCode : "OK",
            "isDeclined": false,
            details: {
                    shippingContact: getShippingContact(awsOrder),
                    billingContact: getBillingContact(awsOrder)
                }
            });
    } catch(err) {
        console.log(err);
        res.json({
            remoteConnectionStatus: err.remoteConnectionStatus,
            responseCode : "Error",
            "isDeclined": true,
            details: {
                error: err,
            }
        });
    }

});



module.exports = router;