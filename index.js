const express = require('express');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
app.use(express.json());

// Route pou teste si sèvè a ap kouri
app.get('/', (req, res) => {
  res.json({ status: 'CallServer ap kouri!' });
});

// Koute Firestore epi voye FCM
const db = admin.firestore();

db.collection('calls').onSnapshot(async (snapshot) => {
  snapshot.docChanges().forEach(async (change) => {
    if (change.type === 'added') {
      const callData = change.doc.data();
      const callId = change.doc.id;

      if (callData.status !== 'calling') return;

      try {
        // Jwenn tout token FCM
        const usersSnapshot = await db.collection('users').get();
        const tokens = [];

        usersSnapshot.forEach(doc => {
          const userData = doc.data();
          if (doc.id !== callData.callerId && userData.fcmToken) {
            tokens.push(userData.fcmToken);
          }
        });

        if (tokens.length === 0) return;

        const message = {
          tokens: tokens,
          data: {
            type: 'incoming_call',
            callId: callId,
            callerName: callData.callerName || 'Unknown',
            isVideo: callData.isVideo ? 'true' : 'false',
          },
          android: {
            priority: 'high',
          },
        };

        await admin.messaging().sendEachForMulticast(message);
        console.log('FCM voye pou apel:', callId);
      } catch (error) {
        console.error('Erè FCM:', error);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sèvè ap kouri sou port ${PORT}`);
});