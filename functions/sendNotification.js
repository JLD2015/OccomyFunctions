const admin = require("firebase-admin");

function sendNotification(userid, token, title, body) {
  const message = {
    notification: {
      title: title,
      body: body,
    },
    android: {
      notification: {
        sound: "default",
      },
    },
    apns: {
      payload: {
        aps: {
          sound: "default",
        },
      },
    },
    token: token,
  };

  // Send a message to the device corresponding to the provided
  // registration token.
  try {
    admin
      .messaging()
      .send(message)
      .then((response) => {
        // Response is a message ID string.
        console.log("Successfully sent message:", response);
      })
      .catch(async (e) => {
        if (e.message == "Requested entity was not found.") {

          await admin
            .firestore()
            .collection("users")
            .doc(userid)
            .update({
              fcmTokens: admin.firestore.FieldValue.arrayRemove(token),
            });
        }

        // Another kind of error
        console.log(e.message);
      });
  } catch (e) {
    console.log(e);
  }
}

module.exports = { sendNotification };
