const express = require("express");
const firebase = require("firebase-admin");
const formidable = require("formidable");
const fs = require("fs");
const randomIDGenerator =
  require("../functions/randomIDGenerator").randomIDGenerator;
const request = require("request");
const router = express.Router();
const { v4: uuid } = require("uuid");

// Create account
router.post("/createaccount", async (req, res) => {
  const form = new formidable.IncomingForm();
  form.parse(req, async (err, fields, files) => {
    // If there was an error retrieving the form
    if (err) {
      res.status(400);
      res.json({ status: "Something went wrong" });
      return;
    }

    // Retrieve the profile picture
    if (!files.profilepicture) {
      res.status(400);
      res.json({ status: "Please provide a profile picture" });
      return;
    }
    const profilepicturepath = files.profilepicture.filepath;

    // Retrieve email address
    if (!fields.email) {
      res.status(400);
      res.json({ status: "Please provide an email address" });
      return;
    }
    const email = fields.email;

    // Rerieve password
    if (!fields.password) {
      res.status(400);
      res.json({ status: "Please provide a password" });
      return;
    }
    const password = fields.password;

    // Retrieve display name
    if (!fields.displayname) {
      res.status(400);
      res.json({ status: "Please provide a display name" });
      return;
    }
    const displayname = fields.displayname;

    // Retrieve phone number
    if (!fields.phonenumber) {
      res.status(400);
      res.json({ status: "Please provide a phone number" });
      return;
    }
    const phonenumber = fields.phonenumber;

    // Create new user account
    firebase
      .auth()
      .createUser({
        email: email,
        password: password,
        displayName: displayname,
      })
      .then(async (userRecord) => {
        // Encode the user's profile picture
        const base64Image = fs.readFileSync(profilepicturepath, "base64");

        // Gernerate deposit ID for the user
        var uniqueID = randomIDGenerator(8);
        const docRef = firebase
          .firestore()
          .collection("users")
          .doc("depositIDs");
        docRef
          .get()
          .then(async (doc) => {
            if (!doc.exists) {
              // If the document doesn't exist then we need to create it
              const data = {
                depositIDs: [uniqueID],
              };
              docRef.set(data);
            } else {
              // If the document does exist then we need to update it
              const existingIDs = doc.data().depositIDs;
              while (uniqueID in existingIDs) {
                uniqueID = randomIDGenerator(8);
              }

              docRef.update({
                depositIDs: firebase.firestore.FieldValue.arrayUnion(uniqueID),
              });

              // Create an API key for the user
              const uniqueAPI = uuid();

              // Upload all of the user's info
              const data = {
                apiKey: uniqueAPI,
                balance: 0,
                bankAccountNumber: "",
                bankName: "",
                compliant: true,
                depositID: uniqueID,
                email: email,
                fcmTokens: [],
                name: displayname,
                phoneNumber: phonenumber,
                profilePhoto: base64Image,
              };

              firebase
                .firestore()
                .collection("users")
                .doc(userRecord.uid)
                .set(data)
                .then(async () => {
                  // Create contact entry for user
                  const contactData = {
                    email: email,
                    name: displayname,
                    phoneNumber: phonenumber,
                    profilePhoto: base64Image,
                  };

                  firebase
                    .firestore()
                    .collection("contacts")
                    .doc(userRecord.uid)
                    .set(contactData)
                    .then(async () => {
                      // Send verification email
                      const data = JSON.stringify({
                        name: displayname,
                        email: email,
                      });

                      const options = {
                        url: "https://api.occomy.com/email/sendverifyemail",
                        body: data,
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                        },
                      };

                      request(options, function (error, response) {
                        if (error) {
                          console.log(error);
                          res.status(400);
                          res.json({ status: error.message });
                          return;
                        }
                        if (response.statusCode == 200) {
                          res.status(200);
                          res.json({ status: "Success" });
                          return;
                        } else {
                          res.status(400);
                          res.json({
                            status: "Could not send verify email",
                          });
                          return;
                        }
                      });
                    })
                    .catch((error) => {
                      console.log(error);
                      res.status(400);
                      res.json({ status: error.message });
                      return;
                    });
                })
                .catch((error) => {
                  console.log(error);
                  res.status(400);
                  res.json({ status: error.message });
                  return;
                });
            }
          })
          .catch((error) => {
            console.log(error);
            res.status(400);
            res.json({ status: error.message });
            return;
          });
      })
      .catch((error) => {
        console.log(error);
        res.status(400);
        res.json({ status: error.message });
        return;
      });
  });
});

// Delete account
router.post("/deleteaccount", async (req, res) => {
  // Get the auth token
  if (!req.headers.authorization) {
    res.status(400);
    res.json({ status: "Please provide a valid auth token" });
    return;
  }
  const authorization = req.headers.authorization;

  // Verify the token
  firebase
    .auth()
    .verifyIdToken(authorization)
    .then(async (decodedToken) => {
      const uid = decodedToken.uid;

      // Get the details for the user
      const userDoc = await firebase
        .firestore()
        .collection("users")
        .doc(uid)
        .get();
      const userData = userDoc.data();

      // Make sure the user doesn't have a balance
      if (userData.balance != 0) {
        res.status(400);
        res.json({ status: "Cannot delete users with a balance" });
        return;
      }

      // Record the contact details for the user
      const data = {
        date: firebase.firestore.FieldValue.serverTimestamp(),
        name: userData.name,
        email: userData.email,
        phoneNumber: userData.phoneNumber,
      };

      firebase
        .firestore()
        .collection("deletedAccounts")
        .doc(uid)
        .set(data)
        .then(async () => {
          // Remove the user's depositID
          firebase
            .firestore()
            .collection("users")
            .doc("depositIDs")
            .update({
              depositIDs: firebase.firestore.FieldValue.arrayRemove(
                userData.depositID
              ),
            });

          // Delete the user's profile in the users collection
          firebase.firestore().collection("users").doc(uid).delete();

          // Delete the user under the contacts collection
          firebase.firestore().collection("contacts").doc(uid).delete();

          // Delete the user under the authorization section
          firebase.auth().deleteUser(uid);

          // Send account deletion email to user
          const data = JSON.stringify({
            email: userData.email,
          });

          const options = {
            url: "https://api.occomy.com/email/sendaccountdeletionemail",
            body: data,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
          };

          request(options, function (error, response) {
            // Handle error
            if (error) {
              console.log(error);
              res.status(400);
              res.json({ status: error.message });
              return;
            }
            if (response.statusCode == 200) {
              res.status(200);
              res.json({ status: "Success" });
              return;
            } else {
              res.status(400);
              res.json({
                status: "Could not send verify email",
              });
              return;
            }
          });
        }) // If the deleted user could not be recorded
        .catch(() => {
          res.status(400);
          res.json({ status: "Could not delete user, aborting" });
          return;
        });
    }) // If the ID token could not be verified
    .catch(() => {
      res.status(400);
      res.json({ status: "Invalid token" });
      return;
    });
});

// Update financial details
router.post("/updatefinancialdetails", async (req, res) => {
  // Get the auth token
  if (!req.headers.authorization) {
    res.status(400);
    res.json({ status: "Please provide a valid auth token" });
    return;
  }
  const authorization = req.headers.authorization;

  // Get the bank name
  if (!req.body.bankname) {
    res.status(400);
    res.json({ status: "Please provide a bank name" });
    return;
  }
  const bankname = req.body.bankname;

  // Get the bank account number
  if (!req.body.bankaccountnumber) {
    res.status(400);
    res.json({ status: "Please provide a bank account number" });
    return;
  }
  const bankaccountnumber = req.body.bankaccountnumber;

  // Verify the token
  firebase
    .auth()
    .verifyIdToken(authorization)
    .then(async (decodedToken) => {
      const uid = decodedToken.uid;

      // Update the user's financial details
      firebase
        .firestore()
        .collection("users")
        .doc(uid)
        .update({ bankAccountNumber: bankaccountnumber, bankName: bankname })
        .then(() => {
          // Trigger the callback
          res.status(200);
          res.json({ status: "Success" });
          return;
        });
    }) // If the ID token could not be verified
    .catch(() => {
      res.status(400);
      res.json({ status: "Invalid token" });
      return;
    });
});

// Update profile details
router.post("/updateprofiledetails", async (req, res) => {
  // Get the auth token
  if (!req.headers.authorization) {
    res.status(400);
    res.json({ status: "Please provide a valid auth token" });
    return;
  }
  const authorization = req.headers.authorization;

  const form = new formidable.IncomingForm();
  form.parse(req, async (err, fields, files) => {
    // If there was an error retrieving the form
    if (err) {
      res.status(400);
      res.json({ status: "Something went wrong" });
      return;
    }

    // Get the profile picture
    if (!files.profilepicture) {
      res.status(400);
      res.json({ status: "Please provide a profile picture" });
      return;
    }
    const profilepicturepath = files.profilepicture.filepath;

    // Retrieve name
    if (!fields.name) {
      res.status(400);
      res.json({ status: "Please provide a name" });
      return;
    }
    const name = fields.name;

    // Rerieve phone number
    if (!fields.phone) {
      res.status(400);
      res.json({ status: "Please provide a phone number" });
      return;
    }
    const phone = fields.phone;

    // Verify the token
    firebase
      .auth()
      .verifyIdToken(authorization)
      .then(async (decodedToken) => {
        const uid = decodedToken.uid;

        // Start transaction
        try {
          firebase.firestore().runTransaction(async (transaction) => {
            // Encode the user's profile picture
            const base64Image = fs.readFileSync(profilepicturepath, "base64");

            // Update the user's details
            firebase.firestore().collection("users").doc(uid).update({
              name: name,
              phoneNumber: phone,
              profilePhoto: base64Image,
            });

            res.status(200);
            res.json({ status: "Success" });
            return;

          });
        } catch (error) {
          console.log(error);
          res.status(400);
          res.json({ status: "Failed" });
          return;
        }
      }) // If the ID token could not be verified
      .catch(() => {
        res.status(400);
        res.json({ status: "Invalid token" });
        return;
      });
  });
});

// Export the router
module.exports = router;
