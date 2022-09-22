var decrypt = require("../functions/cryptography").decrypt;
var express = require("express");
var firebase = require("firebase-admin");
var randomIDGenerator =
  require("../functions/randomIDGenerator").randomIDGenerator;
var router = express.Router();

// To check if server is running
app.get("/", (req, res) => {
  res.send("<div>Occomy transaction server running</div>");
});

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

  // Decode the api key
  var uid = null;
  try {
    uid = decrypt(apikey);
  } catch {
    res.status(400);
    res.json({ status: "Invalid API key" });
    return;
  }

  // Retrieve the merchant's profile
  const merchantDoc = await firebase
    .firestore()
    .collection("users")
    .doc(uid)
    .get();
  if (!merchantDoc.exists) {
    res.status(400);
    res.json({ status: "Invalid API key" });
    return;
  }

  const merchantID = merchantDoc.id;
  const merchantData = merchantDoc.data();
  const merchantName = merchantData.name;
  const merchantPhotoURL = merchantData.profilePhotoUrl;

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
    merchantProfilePhoto: merchantPhotoURL,
    transactionID: uniqueID,
    status: "pending",
    date: firebase.firestore.FieldValue.serverTimestamp(),
    customerID: " ",
    customerName: " ",
    customerProfilePhoto: " ",
  };

  const res2 = await firebase.firestore().collection("transactions").add(data);

  res.status(200);
  res.json({
    status: "Success",
    documentID: res2.id,
    transactionID: uniqueID,
    merchantProfilePhoto: merchantPhotoURL,
    merchantName: merchantName,
  });
  return;
});

module.exports = router;
