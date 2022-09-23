const APNsNotification =
  require("../functions/sendNotification").APNsNotification;
const express = require("express");
const firebase = require("firebase-admin");
const randomIDGenerator =
  require("../functions/randomIDGenerator").randomIDGenerator;
const router = express.Router();

// Create a transaction
router.post("/sendfundsmessage", async (req, res) => {
  // Get the authorization credentials
  if (!req.headers.authorization) {
    res.status(400);
    res.json({ status: "Please provide authorization credentials" });
    return;
  }
  const authorization = req.headers.authorization;

  // Get the recipeint ID
  if (!req.body.recipientid) {
    res.status(400);
    res.json({ status: "Please provide a valid recipient ID" });
    return;
  }
  const recipientid = req.body.recipientid;

  // Get the amount
  if (!req.body.amount) {
    res.status(400);
    res.json({ status: "Please provide a valid amount" });
    return;
  }
  var amount = req.body.amount;
  if (isNaN(amount)) {
    res.status(400);
    res.json({ status: "Please provide a valid amount" });
    return;
  }
  amount = Number(amount).toFixed(2);
  amount = Number(amount);

  // Get the latitude
  if (!req.body.latitude) {
    res.status(400);
    res.json({ status: "Please provide a latitude" });
    return;
  }
  const latitude = req.body.latitude;

  // Get the longitude
  if (!req.body.longitude) {
    res.status(400);
    res.json({ status: "Please provide a longitude" });
    return;
  }
  const longitude = req.body.longitude;

  // Verify the token
  firebase
    .auth()
    .verifyIdToken(authorization)
    .then((decodedToken) => {
      const uid = decodedToken.uid;

      //Run the transaction
      try {
        firebase.firestore().runTransaction(async (transaction) => {
          // 1. Read operations

          const recipientDoc = await transaction.get(
            firebase.firestore().collection("users").doc(recipientid)
          );
          const recipientData = recipientDoc.data();

          const senderDoc = await transaction.get(
            firebase.firestore().collection("users").doc(uid)
          );
          const senderData = senderDoc.data();

          // 2. Write operations

          // Make sure customer isn't transacting with himself
          if (recipientDoc.id == senderDoc.id) {
            res.status(400);
            res.json({ status: "Cannot transact with yourself" });
            return;
          }

          // Generate transaction ID
          var uniqueID = randomIDGenerator(8);
          const docRef = firebase
            .firestore()
            .collection("transactions")
            .doc("transactionIDs");
          const doc = await docRef.get();

          if (!doc.exists) {
            // If the document doesn't exist we need to create it
            const data = {
              transactionIDs: [uniqueID],
            };
            await firebase
              .firestore()
              .collection("transactions")
              .doc("transactionIDs")
              .set(data);
          } else {
            // If the document does exist we just add the unique transaction ID
            const existingIDs = doc.data()["transactionIDs"];
            while (existingIDs.includes(uniqueID)) {
              uniqueID = randomIDGenerator(8);
            }
            await docRef.update({
              transactionIDs:
                firebase.firestore.FieldValue.arrayUnion(uniqueID),
            });
          }

          if (senderData.balance >= Number(amount)) {
            // Recipient values
            transaction.update(
              firebase.firestore().collection("users").doc(recipientid),
              {
                balance: recipientData.balance + Number(amount),
              }
            );
            // Sender values
            transaction.update(
              firebase.firestore().collection("users").doc(uid),
              {
                balance: senderData.balance - Number(amount),
              }
            );
            // Transaction Values
            transaction.set(
              firebase.firestore().collection("transactions").doc(),
              {
                amount: Number(amount),
                merchantID: recipientid,
                merchantName: recipientData.name,
                merchantProfilePhoto: recipientData.profilePhotoUrl,
                transactionID: uniqueID,
                status: "approved",
                date: firebase.firestore.FieldValue.serverTimestamp(),
                customerID: uid,
                customerName: senderData.name,
                customerProfilePhoto: senderData.profilePhotoUrl,
                latitude: latitude,
                longitude: longitude,
              }
            );
            // Send notifications to sender and receiver
            const senderTokens = senderData.APNs;
            for (const token in senderTokens) {
              APNsNotification(
                senderTokens[token],
                "Made Payment",
                `Paid R${Number(amount).toFixed(2)} to ${recipientData.name}`,
                function (status, APNsCode) {
                  if (status == "Failed") {
                    // Remove the token from the database
                    firebase
                      .firestore()
                      .collection("users")
                      .doc(senderDoc.id)
                      .update({
                        APNs: firebase.firestore.FieldValue.arrayRemove(
                          APNsCode
                        ),
                      });
                  }
                }
              );
            }
            const receiverTokens = recipientData.APNs;
            for (const token in receiverTokens) {
              APNsNotification(
                receiverTokens[token],
                "Received Payment",
                `Received R${Number(amount).toFixed(2)} from ${
                  senderData.name
                }`,
                function (status, APNsCode) {
                  if (status == "Failed") {
                    // Remove the token from the database
                    firebase
                      .firestore()
                      .collection("users")
                      .doc(recipientDoc.id)
                      .update({
                        APNs: firebase.firestore.FieldValue.arrayRemove(
                          APNsCode
                        ),
                      });
                  }
                }
              );
            }
            res.status(200);
            res.json({ status: "Success" });
            return;
          } else {
            transaction.set(
              firebase.firestore().collection("transactions").doc(),
              {
                amount: Number(amount),
                merchantID: recipientid,
                merchantName: recipientData.name,
                merchantProfilePhoto: recipientData.profilePhotoUrl,
                transactionID: uniqueID,
                status: "declined",
                date: firebase.firestore.FieldValue.serverTimestamp(),
                customerID: uid,
                customerName: senderData.name,
                customerProfilePhoto: senderData.profilePhotoUrl,
                latitude: latitude,
                longitude: longitude,
              }
            );
            res.status(400);
            res.json({ status: "Failed" });
            return;
          }
        });
      } catch (e) {
        // If the transaction was unsuccessful
        console.log("Transaction failed:", e);
        res.status(400);
        res.json({ status: "Failed" });
        return;
      }
    })
    // If the ID token could not be verified
    .catch(() => {
      res.status(400);
      res.json({ status: "Invalid token" });
      return;
    });
});

// Export the router
module.exports = router;
