const client = require("@xmpp/client").client;
const express = require("express");
const firebase = require("firebase-admin");
const formidable = require("formidable");
const fs = require("fs");
const randomIDGenerator =
  require("../functions/randomIDGenerator").randomIDGenerator;
const request = require("request");
const router = express.Router();
const { v4: uuid } = require("uuid");
const xml = require("@xmpp/client").xml;

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

              // Generate an XMPP account for the user
              const XMPPUsername = uuid();
              const XMPPPassword = uuid();

              const XMPPData = JSON.stringify({
                user: XMPPUsername,
                host: "xmpp.occomy.com",
                password: XMPPPassword,
              });

              const authorization =
                `Basic ` +
                Buffer.from("jdalton@xmpp.occomy.com:Balthazar123!").toString(
                  `base64`
                );
              const options = {
                url: "https://xmpp.occomy.com:5443/api/register",
                body: XMPPData,
                method: "POST",
                headers: {
                  Authorization: authorization,
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
                  // Upload all of the user's info
                  const data = {
                    APNs: [],
                    apiKey: uniqueAPI,
                    balance: 0,
                    bankAccountNumber: "",
                    bankName: "",
                    compliant: true,
                    depositID: uniqueID,
                    email: email,
                    jid: XMPPUsername + "@xmpp.occomy.com",
                    jidPassword: XMPPPassword,
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
                      // Create XMPP entry for user
                      const XMPPData = {
                        email: email,
                        jid: XMPPUsername,
                        name: displayname,
                        phoneNumber: phonenumber,
                      };

                      firebase
                        .firestore()
                        .collection("XMPP")
                        .doc(userRecord.uid)
                        .set(XMPPData)
                        .then(async () => {
                          // Update the user's name and profile photo on the XMPP server
                          const xmpp = client({
                            service: "xmpp://xmpp.occomy.com:5222",
                            username: XMPPUsername,
                            password: XMPPPassword,
                          });

                          xmpp.on("online", async (address) => {
                            // Update the user's VCard once we are online
                            const iq = xml(
                              "iq",
                              { id: uuid(), type: "set" },
                              xml(
                                "vCard",
                                { xmlns: "vcard-temp" },
                                xml("FN", {}, displayname),
                                xml("JABBERID", {}, XMPPUsername),
                                xml(
                                  "PHOTO",
                                  {},
                                  xml("TYPE", {}, "image/jpeg"),
                                  xml("BINVAL", {}, base64Image)
                                )
                              )
                            );
                            await xmpp.send(iq);
                          });

                          xmpp.start().catch(console.error);

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

          // Delete the user under the XMPP collection
          firebase.firestore().collection("XMPP").doc(uid).delete();

          // Delete the user under the authorization section
          firebase.auth().deleteUser(uid);

          // Delete the user's XMPP account
          const XMPPData = JSON.stringify({
            user: userData.jid,
            host: "xmpp.occomy.com",
          });

          const authorization =
            `Basic ` +
            Buffer.from("jdalton@xmpp.occomy.com:Balthazar123!").toString(
              `base64`
            );

          const options = {
            url: "https://xmpp.occomy.com:5443/api/unregister",
            body: XMPPData,
            method: "POST",
            headers: {
              Authorization: authorization,
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

            // If successful
            if (response.statusCode == 200) {
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

// Export the router
module.exports = router;
