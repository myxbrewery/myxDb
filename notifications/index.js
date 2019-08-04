const admin = require('firebase-admin')
const config = require('../.firebase-config')

const app = admin.initializeApp({
    credential: admin.credential.cert(config),
    databaseURL: "https://dw-2d-3dcff.firebaseio.com"
});

module.exports = {
    async sendNotification(topic, title, body) {
        const messaging = await app.messaging()

        return await messaging.sendToTopic(
            topic, {
                notification: {title, body}
            })
    }
}
