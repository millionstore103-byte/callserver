const express = require('express');
const admin = require('firebase-admin');
const fs = require('fs');

let serviceAccount;
try {
  const content = fs.readFileSync('/etc/secrets/serviceAccount.json', 'utf8');
  serviceAccount = JSON.parse(content);
  console.log('Secret file chaje!');
} catch (e) {
  serviceAccount = require('./serviceAccount.json');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'CallServer ap kouri!' });
});

const db = admin.firestore();
const processedCalls = new Set();

async function checkForCalls() {
  try {
    const snapshot = await db.collection('calls')
      .where('status', '==', 'calling')
      .get();

    for (const doc of snapshot.docs) {
      const callId = doc.id;
      
      if (processedCalls.has(callId)) continue;
      processedCalls.add(callId);

      const callData = doc.data();
      console.log('Nouvo apel detekte:', callId);

      try {
        const usersSnapshot = await db.collection('users').get();
        const tokens = [];

        usersSnapshot.forEach(userDoc => {
          const userData = userDoc.data();
          if (userDoc.id !== callData.callerId && userData.fcmToken) {
            tokens.push(userData.fcmToken);
          }
        });

        if (tokens.length === 0) {
          console.log('Pa gen token FCM disponib');
          continue;
        }

        console.log('Voye FCM bay', tokens.length, 'moun');

        const message = {
          tokens: tokens,
          data: {
            type: 'incoming_call',
            callId: callId,
            callerName: callData.callerName || 'Unknown',
            isVideo: callData.isVideo ? 'true' : 'false',
          },
          android: { priority: 'high' },
        };

        await admin.messaging().sendEachForMulticast(message);
        console.log('FCM voye pou apel:', callId);
      } catch (err) {
        console.error('Erè FCM:', err.message);
      }
    }

    // Netwaye vye apel ki pa la ankò
    for (const callId of processedCalls) {
      const doc = await db.collection('calls').doc(callId).get();
      if (!doc.exists) {
        processedCalls.delete(callId);
      }
    }

  } catch (err) {
    console.error('Erè polling:', err.message);
  }
}

// Verifye chak 3 segonn
setInterval(checkForCalls, 3000);
console.log('Polling kòmanse — verifye chak 3 segonn');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sèvè ap kouri sou port ${PORT}`);
});