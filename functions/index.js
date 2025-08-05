const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialize the Firebase Admin SDK.
admin.initializeApp();
const db = admin.firestore();

/**
 * A Callable Cloud Function to handle matchmaking for the roast battle.
 */
exports.findPartner = functions.https.onCall(async (data, context) => {
  // Ensure the user is authenticated.
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated.",
    );
  }

  const { uid } = context.auth;
  const { username, avatar } = data;

  // A Firestore transaction ensures that we safely read and write data
  // without race conditions.
  return db.runTransaction(async (transaction) => {
    const waitingUsersRef = db.collection("waitingUsers");

    const waitingQuery = waitingUsersRef
      .where("uid", "!=", uid)
      .limit(1);

    const waitingSnapshot = await transaction.get(waitingQuery);

    if (waitingSnapshot.empty) {
      // --- NO PARTNER FOUND ---
      const userWaitingRef = db.collection("waitingUsers").doc(uid);
      await transaction.set(userWaitingRef, {
        uid,
        username,
        avatar,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`🔎 ${username} (${uid}) ` +
        `is now waiting for a partner.`);
      return { status: "waiting" };
    } else {
      // --- PARTNER FOUND ---
      const partnerDoc = waitingSnapshot.docs[0];
      const partnerData = partnerDoc.data();
      const partnerUid = partnerData.uid;

      const sessionRef = db.collection("sessions").doc();
      await transaction.set(sessionRef, {
        participants: [uid, partnerUid],
        participantInfo: {
          [uid]: { username, avatar },
          [partnerUid]: {
            username: partnerData.username,
            avatar: partnerData.avatar,
          },
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await transaction.delete(partnerDoc.ref);

      const user1SessionPointer = db.collection("users").doc(uid);
      const user2SessionPointer = db.collection("users").doc(partnerUid);

      await transaction.set(user1SessionPointer, {
        activeSessionId: sessionRef.id,
      });
      await transaction.set(user2SessionPointer, {
        activeSessionId: sessionRef.id,
      });

      console.log(`🔥 Match found! Session ID: ${sessionRef.id} ` +
        `for ${uid} and ${partnerUid}`);

      return { status: "matched", sessionId: sessionRef.id };
    }
  });
});

/**
 * A Cloud Function that cleans up user data on deletion.
 */
exports.cleanupUser = functions.auth.user().onDelete(async (user) => {
  const { uid } = user;
  const batch = db.batch();

  const waitingRef = db.collection("waitingUsers").doc(uid);
  batch.delete(waitingRef);

  console.log(`🧹 Cleaned up data for deleted user: ${uid}`);
  return batch.commit();
});
