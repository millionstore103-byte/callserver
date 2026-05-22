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
  console.log('Fichye lokal chaje!');
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

// Fonksyon pou koute Firestore ak rekonneksyon otomatik
function listenForCalls() {
  console.log('Kòmanse koute Firestore...');
  
  const unsubscribe = db.collection('calls').onSnapshot(
    async (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          const callData = change.doc.data();
          const callId = change.doc.id;

          if (callData.status !== 'calling') return;

          console.log('Nouvo apel detekte:', callId);

          try {
            const usersSnapshot = await db.collection('users').get();
            const tokens = [];

            usersSnapshot.forEach(doc => {
              const userData = doc.data();
              if (doc.id !== callData.callerId && userData.fcmToken) {
                tokens.push(userData.fcmToken);
              }
            });

            if (tokens.length === 0) {
              console.log('Pa gen token FCM disponib');
              return;
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
              android: {
                priority: 'high',
              },
            };

            await admin.messaging().sendEachForMulticast(message);
            console.log('FCM voye pou apel:', callId);
          } catch (error) {
            console.error('Erè FCM:', error.message);
          }
        }
      });
    },
    (error) => {
      // Rekonnekte lè koneksyon kase
      console.error('Firestore erè:', error.message);
      console.log('Ap rekonnekte nan 5 segonn...');
      unsubscribe();
      setTimeout(listenForCalls, 5000);
    }
  );
}

// Kòmanse koute
listenForCalls();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sèvè ap kouri sou port ${PORT}`);
});