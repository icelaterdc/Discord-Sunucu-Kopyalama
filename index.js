const Eris   = require('eris');
const backup = require('./backup');
const config = require('./config.json');

const client = new Eris.Client(config.userToken, {
  defaultImageFormat: "png",
  getAllUsers: false
});

client.on('ready', async () => {
  console.log(`Giriş yapıldı: ${client.user.username}#${client.user.discriminator}`);
  console.log('Klonlama işlemi başlatılıyor...');
  try {
    await backup.cloneGuild(client, config);
    console.log('Sunucu klonlama tamamlandı!');
  } catch (err) {
    console.error('Klonlama hatası:', err);
  }
  console.log('İşlem tamamlandı, self-bot hâlâ aktif.');
});

client.on('error', err => {
  console.error('Client Error:', err);
});

client.connect();
