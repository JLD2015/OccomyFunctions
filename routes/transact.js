const APNsNotification =
  require("../functions/sendNotification").APNsNotification;
const decrypt = require("../functions/cryptography").decrypt;
const express = require("express");
const firebase = require("firebase-admin");
const randomIDGenerator =
  require("../functions/randomIDGenerator").randomIDGenerator;
const router = express.Router();

// Create a transaction
router.post("/createtransaction", async (req, res) => {
  // Get the api key
  if (!req.headers.authorization) {
    res.status(400);
    res.json({ status: "Please provide a valid API key" });
    return;
  }
  const apikey = req.headers.authorization;

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

  // Get the description
  if (!req.body.description) {
    res.status(400);
    res.json({ status: "Please provide a valid description" });
    return;
  }
  const description = req.body.description;

  // Retrieve the merchant's profile
  const merchantDoc = await firebase
    .firestore()
    .collection("users")
    .where("apiKey", "==", apikey)
    .get();

  if (merchantDoc.empty) {
    res.status(400);
    res.json({ status: "Invalid API key" });
    return;
  } else {
    const merchantID = merchantDoc.docs[0].id;
    const merchantData = merchantDoc.docs[0].data();
    const merchantName = merchantData.name;
    const merchantProfilePhoto = merchantData.profilePhoto;

    // Generate transaction ID
    var uniqueID = randomIDGenerator(8);

    // Make sure transactionID is unique
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
        transactionIDs: firebase.firestore.FieldValue.arrayUnion(uniqueID),
      });
    }

    // Create transaction on firestore
    const data = {
      amount: parseFloat(amount),
      description: description,
      merchantID: merchantID,
      merchantName: merchantName,
      merchantProfilePhoto: merchantProfilePhoto,
      transactionID: uniqueID,
      status: "pending",
      date: firebase.firestore.FieldValue.serverTimestamp(),
      customerID: " ",
      customerName: " ",
      customerProfilePhoto: " ",
    };

    const res2 = await firebase
      .firestore()
      .collection("transactions")
      .add(data);

    res.status(200);
    res.json({
      status: "Success",
      documentID: res2.id,
      transactionID: uniqueID,
      merchantProfilePhoto: merchantProfilePhoto,
      merchantName: merchantName,
    });
    return;
  }
});

// Approve a transaction
router.post("/approvetransaction", async (req, res) => {
  // Get the authorization credentials
  if (!req.headers.authorization) {
    res.status(400);
    res.json({ status: "Please provide authorization credentials" });
    return;
  }
  const authorization = req.headers.authorization;

  // Get the transaction ID
  if (!req.body.transactionid) {
    res.status(400);
    res.json({ status: "Please provide a valid transactionID" });
    return;
  }
  const transactionid = req.body.transactionid;

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
          const transactionDoc = await transaction.get(
            firebase.firestore().collection("transactions").doc(transactionid)
          );
          const transactionData = transactionDoc.data();

          if (!transactionData) {
            res.status(400);
            res.json({ status: "Failed" });
            return;
          }

          const merchantDoc = await transaction.get(
            firebase
              .firestore()
              .collection("users")
              .doc(transactionData.merchantID)
          );
          const merchantData = merchantDoc.data();

          const customerDoc = await transaction.get(
            firebase.firestore().collection("users").doc(uid)
          );
          const customerData = customerDoc.data();

          // 2. Write operations

          // Make sure customer isn't transacting with himself
          if (merchantDoc.id == customerDoc.id) {
            res.status(400);
            res.json({ status: "Cannot transact with yourself" });
            return;
          }

          // Make sure the transaction hasn't already been processed
          if (transactionData.status != "pending") {
            res.status(400);
            res.json({ status: "Transaction already processed" });
            return;
          }

          // Update necesary data
          if (customerData.balance >= transactionData.amount) {
            // Merchant values
            transaction.update(
              firebase
                .firestore()
                .collection("users")
                .doc(transactionData["merchantID"]),
              {
                balance: merchantData.balance + transactionData.amount,
              }
            );

            // Customer values
            transaction.update(
              firebase.firestore().collection("users").doc(uid),
              {
                balance: customerData.balance - transactionData.amount,
              }
            );

            // Transaction Values
            transaction.update(
              firebase
                .firestore()
                .collection("transactions")
                .doc(transactionid),
              {
                customerName: customerData.name,
                customerID: customerDoc.id,
                customerProfilePhoto: customerData.profilePhoto,
                status: "approved",
                date: firebase.firestore.FieldValue.serverTimestamp(),
                latitude: latitude,
                longitude: longitude,
              }
            );

            // Send notifications to everybody

            // Merchant
            for (const token of merchantData.APNs) {
              APNsNotification(
                token,
                "Received Payment",
                `Received R${transactionData.amount.toFixed(2)} from ${
                  customerData.name
                }`,
                function (status, APNsCode) {
                  if (status == "Failed") {
                    // Remove the token from the database
                    firebase
                      .firestore()
                      .collection("users")
                      .doc(merchantDoc.id)
                      .update({
                        APNs: firebase.firestore.FieldValue.arrayRemove(
                          APNsCode
                        ),
                      });
                  }
                }
              );
            }

            // Customer
            for (const token of customerData.APNs) {
              APNsNotification(
                token,
                "Made Payment",
                `Paid R${transactionData.amount.toFixed(2)} to ${
                  merchantData.name
                }`,
                function (status, APNsCode) {
                  if (status == "Failed") {
                    // Remove the token from the database
                    firebase
                      .firestore()
                      .collection("users")
                      .doc(customerDoc.id)
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
            transaction.update(
              firebase
                .firestore()
                .collection("transactions")
                .doc(transactionid),
              {
                customerName: customerData.name,
                customerID: customerDoc.id,
                customerProfilePhoto: customerData.profilePhoto,
                status: "declined",
                date: firebase.firestore.FieldValue.serverTimestamp(),
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

// Decline a transaction
router.post("/declinetransaction", async (req, res) => {
  // Get the authorization credentials
  if (!req.headers.authorization) {
    res.status(400);
    res.json({ status: "Please provide authorization credentials" });
    return;
  }
  const authorization = req.headers.authorization;

  // Get the transaction ID
  if (!req.body.transactionid) {
    res.status(400);
    res.json({ status: "Please provide a valid transactionID" });
    return;
  }
  const transactionid = req.body.transactionid;

  // Verify the token
  firebase
    .auth()
    .verifyIdToken(authorization)
    .then((decodedToken) => {
      const uid = decodedToken.uid;

      // Run transaction
      try {
        firebase
          .firestore()
          .runTransaction(async (transaction) => {
            transaction.update(
              firebase
                .firestore()
                .collection("transactions")
                .doc(transactionid),
              {
                status: "declined",
                date: firebase.firestore.FieldValue.serverTimestamp(),
              }
            );
          })
          .then(() => {
            res.status(200);
            res.json({ status: "Success" });
            return;
          });
      } catch (e) {
        // If the transaction could not be run
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

// Decline a transaction
router.post("/withdrawal", async (req, res) => {
  // Get the authorization credentials
  if (!req.headers.authorization) {
    res.status(400);
    res.json({ status: "Please provide authorization credentials" });
    return;
  }
  const authorization = req.headers.authorization;

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

  // Verify the token
  firebase
    .auth()
    .verifyIdToken(authorization)
    .then((decodedToken) => {
      const uid = decodedToken.uid;
      const withdrawalFees = 5;

      // Run transaction
      try {
        firebase.firestore().runTransaction(async (transaction) => {
          // 1. Read operations
          const userDoc = await transaction.get(
            firebase.firestore().collection("users").doc(uid)
          );
          const userData = userDoc.data();

          // Check whether the user has sufficient funds for a withdrawal
          if (Number(userData.balance) < amount + withdrawalFees) {
            res.status(400);
            res.json({ status: "Insufficient funds" });
            return;
          }

          // Update the user's balance and fees
          transaction.update(
            firebase.firestore().collection("users").doc(uid),
            {
              balance: userData.balance - amount - withdrawalFees,
            }
          );

          // Record the withdrawal in the withdrawals collection
          transaction.set(
            firebase.firestore().collection("withdrawals").doc(),
            {
              amount: amount,
              date: firebase.firestore.FieldValue.serverTimestamp(),
              processed: false,
              userID: uid,
            }
          );

          // Send notification to the user
          for (const token of userData.APNs) {
            APNsNotification(
              token,
              "Withdrawal",
              `Withdrew R${Number(amount).toFixed(2)}`,
              function (status, APNsCode) {
                if (status == "Failed") {
                  // Remove the token from the database
                  firebase
                    .firestore()
                    .collection("users")
                    .doc(userDoc.id)
                    .update({
                      APNs: firebase.firestore.FieldValue.arrayRemove(APNsCode),
                    });
                } else {
                  console.log("Sent");
                }
              }
            );
          }

          // Send response
          res.status(200);
          res.json({ status: "Success" });
          return;
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

// Send funds
router.post("/sendfunds", async (req, res) => {
  // Get the authorization credentials
  if (!req.headers.authorization) {
    res.status(400);
    res.json({ status: "Please provide authorization credentials" });
    return;
  }
  const authorization = req.headers.authorization;

  // Get the amount
  if (!req.body.amount) {
    console.log("In here");
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

  // Get the description
  if (!req.body.description) {
    res.status(400);
    res.json({ status: "Please provide a valid description" });
    return;
  }
  const description = req.body.description;

  // Get the merchantID
  if (!req.body.merchantid) {
    res.status(400);
    res.json({ status: "Please provide a valid merchantid" });
    return;
  }
  const merchantid = req.body.merchantid;

  // Get the latitude
  if (!req.body.latitude) {
    res.status(400);
    res.json({ status: "Please provide a valid latitude" });
    return;
  }
  const latitude = req.body.latitude;
  
  // Get the longitude
  if (!req.body.longitude) {
    res.status(400);
    res.json({ status: "Please provide a valid longitude" });
    return;
  }
  const longitude = req.body.longitude;

  // Validate the user
  firebase
    .auth()
    .verifyIdToken(authorization)
    .then(async (decodedToken) => {
      // Run transaction
      try {
        firebase.firestore().runTransaction(async (transaction) => {
          const uid = decodedToken.uid;

          // 1. Read operations
          const customerDoc = await transaction.get(
            firebase.firestore().collection("users").doc(uid)
          );
          const customerData = customerDoc.data();

          const merchantDoc = await transaction.get(
            firebase.firestore().collection("users").doc(merchantid)
          );
          const merchantData = merchantDoc.data();

          // Generate transaction ID
          var uniqueID = randomIDGenerator(8);

          // Make sure transactionID is unique
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

          // Create transaction on firestore
          const data = {
            amount: parseFloat(amount),
            description: description,
            latitude: latitude,
            longitude: longitude,
            merchantID: merchantDoc.id,
            merchantName: merchantData.name,
            merchantProfilePhoto: merchantData.profilePhoto,
            transactionID: uniqueID,
            status: "approved",
            date: firebase.firestore.FieldValue.serverTimestamp(),
            customerID: customerDoc.id,
            customerName: customerData.name,
            customerProfilePhoto: customerData.profilePhoto,
          };

          await firebase.firestore().collection("transactions").add(data);

          res.status(200);
          res.json({ status: "Success" });
          return;
        });
      } catch (e) {
        // If the transaction was unsuccessful
        console.log("Transaction failed:", e);
        res.status(400);
        res.json({ status: "Failed" });
        return;
      }
    })
    // If the user could not be validated
    .catch(() => {
      res.status(400);
      res.json({ status: "Invalid token" });
      return;
    });
});

// Request payment
router.post("/requestpayment", async (req, res) => {
  // Get the authorization credentials
  if (!req.headers.authorization) {
    res.status(400);
    res.json({ status: "Please provide authorization credentials" });
    return;
  }
  const authorization = req.headers.authorization;

  // Get the amount
  if (!req.body.amount) {
    console.log("In here");
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

  // Get the description
  if (!req.body.description) {
    res.status(400);
    res.json({ status: "Please provide a valid description" });
    return;
  }
  const description = req.body.description;

  // Get the merchantID
  if (!req.body.customerid) {
    res.status(400);
    res.json({ status: "Please provide a valid customerid" });
    return;
  }
  const customerid = req.body.customerid;

  // Get the latitude
  if (!req.body.latitude) {
    res.status(400);
    res.json({ status: "Please provide a valid latitude" });
    return;
  }
  const latitude = req.body.latitude;
  
  // Get the longitude
  if (!req.body.longitude) {
    res.status(400);
    res.json({ status: "Please provide a valid longitude" });
    return;
  }
  const longitude = req.body.longitude;

  // Validate the user
  firebase
    .auth()
    .verifyIdToken(authorization)
    .then(async (decodedToken) => {
      // Run transaction
      try {
        firebase.firestore().runTransaction(async (transaction) => {
          const uid = decodedToken.uid;

          // 1. Read operations
          const customerDoc = await transaction.get(
            firebase.firestore().collection("users").doc(customerid)
          );
          const customerData = customerDoc.data();

          const merchantDoc = await transaction.get(
            firebase.firestore().collection("users").doc(uid)
          );
          const merchantData = merchantDoc.data();

          // Generate transaction ID
          var uniqueID = randomIDGenerator(8);

          // Make sure transactionID is unique
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

          // Create transaction on firestore
          const data = {
            amount: parseFloat(amount),
            description: description,
            latitude: latitude,
            longitude: longitude,
            merchantID: merchantDoc.id,
            merchantName: merchantData.name,
            merchantProfilePhoto: merchantData.profilePhoto,
            transactionID: uniqueID,
            status: "requested",
            date: firebase.firestore.FieldValue.serverTimestamp(),
            customerID: customerDoc.id,
            customerName: customerData.name,
            customerProfilePhoto: customerData.profilePhoto,
          };

          await firebase.firestore().collection("transactions").add(data);

          res.status(200);
          res.json({ status: "Success" });
          return;
        });
      } catch (e) {
        // If the transaction was unsuccessful
        console.log("Transaction failed:", e);
        res.status(400);
        res.json({ status: "Failed" });
        return;
      }
    })
    // If the user could not be validated
    .catch(() => {
      res.status(400);
      res.json({ status: "Invalid token" });
      return;
    });
});

// Export the router
module.exports = router;
