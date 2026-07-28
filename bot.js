const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const fs = require('fs');

const bot = new TelegramBot(config.token, { polling: true });

// Database
let users = [];
let orders = [];
const DB_FILE = config.dbFile;
const ORDER_FILE = config.orderFile;

// Maintenance mode
let isMaintenance = config.maintenance || false;

// Load users
function loadUsers() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      users = JSON.parse(data);
    } else {
      users = [];
      saveUsers();
    }
  } catch (error) {
    console.error('Error loading users:', error);
    users = [];
  }
}

function saveUsers() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
  } catch (error) {
    console.error('Error saving users:', error);
  }
}

// Load orders
function loadOrders() {
  try {
    if (fs.existsSync(ORDER_FILE)) {
      const data = fs.readFileSync(ORDER_FILE, 'utf8');
      orders = JSON.parse(data);
    } else {
      orders = [];
      saveOrders();
    }
  } catch (error) {
    console.error('Error loading orders:', error);
    orders = [];
  }
}

function saveOrders() {
  try {
    fs.writeFileSync(ORDER_FILE, JSON.stringify(orders, null, 2));
  } catch (error) {
    console.error('Error saving orders:', error);
  }
}

// Add user
function addUser(userId, username, firstName) {
  const existing = users.find(u => u.id === userId);
  if (!existing) {
    users.push({
      id: userId,
      username: username || 'No username',
      firstName: firstName || 'No name',
      registeredAt: new Date().toISOString()
    });
    saveUsers();
  }
}

// Add order
function addOrder(userId, username, role, price, orderId, link = null) {
  const order = {
    orderId: orderId,
    userId: userId,
    username: username || 'No username',
    role: role,
    price: price,
    link: link,
    status: 'Menunggu Pembayaran',
    createdAt: new Date().toISOString(),
    paidAt: null,
    verifiedAt: null,
    baseFiles: []
  };
  orders.push(order);
  saveOrders();
  return order;
}

// Update order status
function updateOrderStatus(orderId, status, paidAt = null, verifiedAt = null) {
  const order = orders.find(o => o.orderId === orderId);
  if (order) {
    order.status = status;
    if (paidAt) {
      order.paidAt = paidAt;
    }
    if (verifiedAt) {
      order.verifiedAt = verifiedAt;
    }
    saveOrders();
    return order;
  }
  return null;
}

// Add base file to order
function addBaseFileToOrder(orderId, fileId, fileName) {
  const order = orders.find(o => o.orderId === orderId);
  if (order) {
    if (!order.baseFiles) {
      order.baseFiles = [];
    }
    order.baseFiles.push({
      fileId: fileId,
      fileName: fileName,
      sentAt: new Date().toISOString()
    });
    saveOrders();
    return order;
  }
  return null;
}

// Load data
loadUsers();
loadOrders();

// ============ CHECK CHANNEL MEMBERSHIP ============

async function checkChannelMembership(userId) {
  try {
    const chatMember = await bot.getChatMember(config.channel, userId);
    const status = chatMember.status;
    return status === 'member' || status === 'administrator' || status === 'creator';
  } catch (error) {
    console.error('Error checking channel membership:', error);
    return false;
  }
}

async function sendJoinChannelMessage(chatId) {
  const joinMessage = `
🔒 *WAJIB JOIN CHANNEL DULU!*

━━━━━━━━━━━━━━━━━━
⚠️ *Untuk bisa order, kamu harus join channel dulu!*

📢 *Channel: ${config.channel}*

📌 *Cara join:*
1. Klik tombol *JOIN CHANNEL* di bawah
2. Klik *Join* di channel
3. Kembali ke bot dan klik *CEK STATUS*

━━━━━━━━━━━━━━━━━━
💬 *Atau gabung GC dulu:*
${config.groupLink}

🔈 *INFORMASI DARI OWNER* ${config.ownerUsername}
join dulu coy! 🔥
  `;

  try {
    await bot.sendMessage(chatId, joinMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📢 JOIN CHANNEL', url: config.channelLink }
          ],
          [
            { text: '✅ CEK STATUS', callback_data: 'check_channel' }
          ],
          [
            { text: '💬 GC', url: config.groupLink }
          ],
          [
            { text: '👤 Hubungi Owner', callback_data: 'contact_owner' }
          ]
        ]
      }
    });
  } catch (error) {
    console.error('Error sending join message:', error);
  }
}

// ============ MAINTENANCE MODE ============

function isInMaintenance() {
  return isMaintenance;
}

function toggleMaintenance() {
  isMaintenance = !isMaintenance;
  config.maintenance = isMaintenance;
  return isMaintenance;
}

async function sendMaintenanceMessage(chatId) {
  const maintenanceText = `
🛠️ *MODE MAINTENANCE* 🛠️
━━━━━━━━━━━━━━━━━━
⚠️ *Maaf, sedang dalam perbaikan!*

🔧 *Server sedang diurus*
💤 *Atau admin sedang tidur*

━━━━━━━━━━━━━━━━━━
📌 *Informasi:*
• Mohon maaf atas ketidaknyamanannya
• Admin tidak merespon pesanan saat ini
• Silahkan coba lagi nanti

📅 *Kapan aktif?*
Akan diinfokan jika sudah selesai

━━━━━━━━━━━━━━━━━━
💤 *Admin sedang istirahat*
😴 *Tidur dulu ya...*

💬 *Gabung GC: ${config.groupLink}*

🔈 *INFORMASI DARI OWNER* ${config.ownerUsername}
admin lagi tidur coy! 😴
  `;

  try {
    await bot.sendMessage(chatId, maintenanceText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📢 Cek Channel', url: config.channelLink }
          ],
          [
            { text: '💬 GC', url: config.groupLink }
          ],
          [
            { text: '💤 Hubungi Nanti', callback_data: 'back_to_menu' }
          ]
        ]
      }
    });
  } catch (error) {
    console.error('Error sending maintenance message:', error);
  }
}

// ============ MAINTENANCE COMMANDS ============

bot.onText(/\/maintenance/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (userId.toString() === config.ownerId) {
    const status = toggleMaintenance();
    const statusText = status ? '🟡 AKTIF' : '🟢 NONAKTIF';
    const emoji = status ? '🛠️' : '✅';
    
    bot.sendMessage(chatId, `
${emoji} *Mode Maintenance ${statusText}*

━━━━━━━━━━━━━━━━━━
📌 *Status:* ${status ? 'Aktif' : 'Nonaktif'}

${status ? '🔒 Bot dalam mode maintenance' : '🔓 Bot kembali normal'}

⚠️ *Semua user akan mendapat pesan maintenance*
${status ? '💤 Admin bisa tidur dengan tenang' : '🟢 Bot siap melayani order'}

🔈 *INFORMASI DARI OWNER* ${config.ownerUsername}
${status ? 'admin tidur coy! 😴' : 'admin bangun coy! 🔥'}
    `, { parse_mode: 'Markdown' });

    if (status) {
      const maintenanceBroadcast = `
🛠️ *MODE MAINTENANCE AKTIF* 🔒

━━━━━━━━━━━━━━━━━━
⚠️ *Maaf, bot sedang dalam perbaikan!*

🔧 *Server sedang diurus*
💤 *Admin sedang tidur*

📌 *Untuk sementara tidak bisa order*
💬 *Hubungi nanti ya!*

📅 *Akan aktif kembali nanti*

━━━━━━━━━━━━━━━━━━
💤 *Admin sedang istirahat*
😴 *Tidur dulu ya...*

💬 *GC: ${config.groupLink}*

🔈 *INFORMASI DARI OWNER* ${config.ownerUsername}
admin lagi tidur coy! 😴
      `;

      let sentCount = 0;
      for (const user of users) {
        try {
          await bot.sendMessage(user.id, maintenanceBroadcast, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '📢 Cek Channel', url: config.channelLink }
                ],
                [
                  { text: '💬 GC', url: config.groupLink }
                ]
              ]
            }
          });
          sentCount++;
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
          console.error(`Failed to send maintenance to user ${user.id}:`, error.message);
        }
      }

      bot.sendMessage(chatId, `
📤 *Notifikasi maintenance terkirim!*

📊 *Laporan:*
• Berhasil: ${sentCount} user
• Total: ${users.length} user

💤 *Selamat tidur admin!* 😴
      `, { parse_mode: 'Markdown' });
    }
  } else {
    bot.sendMessage(chatId, '❌ Anda tidak memiliki akses!');
  }
});

// OFF MAINTENANCE
bot.onText(/\/offmaintenance/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (userId.toString() === config.ownerId) {
    if (!isInMaintenance()) {
      bot.sendMessage(chatId, `
✅ *Mode Maintenance sudah NONAKTIF!*

━━━━━━━━━━━━━━━━━━
🔓 Bot sudah dalam keadaan normal
🟢 Tidak perlu mematikan lagi

📌 *Status:* NONAKTIF
      `, { parse_mode: 'Markdown' });
      return;
    }

    isMaintenance = false;
    config.maintenance = false;
    
    bot.sendMessage(chatId, `
✅ *Mode Maintenance DINONAKTIFKAN!* 🟢

━━━━━━━━━━━━━━━━━━
📌 *Status:* NONAKTIF

🔓 *Bot kembali normal!*
🟢 *Siap melayani order lagi*

📢 *User sudah bisa:*
• /start
• Order role
• Order BASE
• Kirim bukti TF

━━━━━━━━━━━━━━━━━━
🔈 *INFORMASI DARI OWNER* ${config.ownerUsername}
admin bangun coy! 🔥

🔥 *Ayo mulai order lagi!*
    `, { parse_mode: 'Markdown' });

    const activeBroadcast = `
🟢 *BOT KEMBALI NORMAL!* 🎉

━━━━━━━━━━━━━━━━━━
🔓 *Mode Maintenance telah dinonaktifkan!*

✅ *Bot sudah siap melayani order lagi!*

📌 *Silahkan order sekarang:*
• 👥 MEMBER - Rp 3.000
• 📦 RESS - Rp 7.000
• 👑 OWNER - Rp 9.000
• 📦 BASE - Rp 10.000

🔥 *Klik /start untuk mulai!*

💬 *GC: ${config.groupLink}*

━━━━━━━━━━━━━━━━━━
🔈 *INFORMASI DARI OWNER* ${config.ownerUsername}
admin bangun coy! 🔥
    `;

    let sentCount = 0;
    for (const user of users) {
      try {
        await bot.sendMessage(user.id, activeBroadcast, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📱 Mulai Order', callback_data: 'back_to_menu' },
                { text: '📢 Channel', url: config.channelLink }
              ],
              [
                { text: '💬 GC', url: config.groupLink }
              ]
            ]
          }
        });
        sentCount++;
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        console.error(`Failed to send active notification to user ${user.id}:`, error.message);
      }
    }

    bot.sendMessage(chatId, `
📤 *Notifikasi aktif terkirim!*

📊 *Laporan:*
• Berhasil: ${sentCount} user
• Total: ${users.length} user

🔥 *Selamat berjualan admin!* 🚀
    `, { parse_mode: 'Markdown' });

  } else {
    bot.sendMessage(chatId, '❌ Anda tidak memiliki akses!');
  }
});

bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (userId.toString() === config.ownerId) {
    const status = isInMaintenance();
    const statusText = status ? '🟡 AKTIF' : '🟢 NONAKTIF';
    
    bot.sendMessage(chatId, `
📊 *Status Bot*

━━━━━━━━━━━━━━━━━━
🔧 *Maintenance:* ${statusText}
👤 *Total User:* ${users.length}
📦 *Total Order:* ${orders.length}

${status ? '🔒 Bot dalam maintenance' : '🔓 Bot aktif melayani'}

📌 *Command:*
/maintenance - Toggle maintenance
/offmaintenance - Matikan maintenance
/status - Cek status
    `, { parse_mode: 'Markdown' });
  } else {
    bot.sendMessage(chatId, '❌ Anda tidak memiliki akses!');
  }
});

// ============ START MENU ============

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username;
  const firstName = msg.from.first_name;

  if (isInMaintenance() && userId.toString() !== config.ownerId) {
    await sendMaintenanceMessage(chatId);
    return;
  }

  if (userId.toString() !== config.ownerId) {
    const isMember = await checkChannelMembership(userId);
    if (!isMember) {
      await sendJoinChannelMessage(chatId);
      return;
    }
  }

  addUser(userId, username, firstName);

  if (userId.toString() !== config.ownerId) {
    const ownerMessage = `
👤 *USER BARU!*

🆔 ID: ${userId}
👤 Username: @${username || 'No username'}
📛 Nama: ${firstName || 'No name'}
📅 Waktu: ${new Date().toLocaleString()}

Total user: ${users.length}
✅ *Sudah join channel!*
    `;
    bot.sendMessage(config.ownerId, ownerMessage, { parse_mode: 'Markdown' });
  }
  
  const menuText = `
🤖 *ZYRIX PLP PROJECT* 🤖
━━━━━━━━━━━━━━━━━━
✨ *Selamat Datang!* ✨

Pilih Produk yang mau kamu beli:

👥 *MEMBER* - Rp 3.000
📦 *RESS* - Rp 7.000  
👑 *OWNER* - Rp 9.000
📦 *BASE* - Rp 10.000

━━━━━━━━━━━━━━━━━━
📌 *Fitur:*
• Akses Private Channel
• Support 24/7
• Update Terbaru

✅ *Anda sudah join channel!*

⚡ *Powered by ZYRIX PLP*
👤 *Owner: ${config.ownerUsername}*
`;

  try {
    await bot.sendPhoto(chatId, config.menuImage, {
      caption: menuText,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '👥 MEMBER 3K', callback_data: 'buy_member' },
            { text: '📦 RESS 7K', callback_data: 'buy_ress' }
          ],
          [
            { text: '👑 OWNER 9K', callback_data: 'buy_owner' },
            { text: '📦 BASE 10K', callback_data: 'buy_base' }
          ],
          [
            { text: '📱 QRIS DANA', callback_data: 'show_qris' },
            { text: '✅ Kirim Bukti TF', callback_data: 'send_proof' }
          ],
          [
            { text: '📢 Channel', url: config.channelLink },
            { text: '💬 GC', url: config.groupLink }
          ],
          [
            { text: '👤 Contact Owner', callback_data: 'contact_owner' }
          ]
        ]
      }
    });
  } catch (error) {
    console.error('Error sending menu image:', error);
    bot.sendMessage(chatId, menuText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '👥 MEMBER 3K', callback_data: 'buy_member' },
            { text: '📦 RESS 7K', callback_data: 'buy_ress' }
          ],
          [
            { text: '👑 OWNER 9K', callback_data: 'buy_owner' },
            { text: '📦 BASE 10K', callback_data: 'buy_base' }
          ],
          [
            { text: '📱 QRIS DANA', callback_data: 'show_qris' },
            { text: '✅ Kirim Bukti TF', callback_data: 'send_proof' }
          ],
          [
            { text: '📢 Channel', url: config.channelLink },
            { text: '💬 GC', url: config.groupLink }
          ],
          [
            { text: '👤 Contact Owner', callback_data: 'contact_owner' }
          ]
        ]
      }
    });
  }
});

// ============ SHOW QRIS DANA ============

async function showQRIS(chatId) {
  const qrisText = `
📱 *QRIS DANA - ${config.qris.name}*
━━━━━━━━━━━━━━━━━━

⬇️ *Scan QRIS di bawah untuk bayar:*

📱 *DANA:*
👤 a.n. ${config.payment.dana.name}

💳 *Atau transfer manual:*
📱 ${config.payment.dana.number}
👤 a.n. ${config.payment.dana.name}

💰 *Total:* Sesuai produk yang dipilih

⚠️ *SETELAH BAYAR:*
1. Screenshot bukti transfer
2. Kirim ke bot ini (kirim foto)
3. Tunggu verifikasi

━━━━━━━━━━━━━━━━━━
🔈 *INFORMASI DARI OWNER* ${config.ownerUsername}
order coy! 🔥

💬 *GC: ${config.groupLink}*
  `;

  try {
    await bot.sendPhoto(chatId, config.qris.imageUrl, {
      caption: qrisText,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Kirim Bukti TF', callback_data: 'send_proof' }
          ],
          [
            { text: '💬 GC', url: config.groupLink },
            { text: '👤 Hubungi Owner', callback_data: 'contact_owner' }
          ],
          [
            { text: '🔙 Kembali ke Menu', callback_data: 'back_to_menu' }
          ]
        ]
      }
    });
  } catch (error) {
    bot.sendMessage(chatId, `
❌ *Gagal menampilkan QRIS*

📱 *Silahkan transfer manual ke:*
DANA: ${config.payment.dana.number}
a.n. ${config.payment.dana.name}

📌 *Atau hubungi owner:*
${config.ownerUsername}

💬 *GC: ${config.groupLink}*
    `, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '💬 GC', url: config.groupLink },
            { text: '👤 Contact Owner', callback_data: 'contact_owner' }
          ],
          [
            { text: '🔙 Kembali ke Menu', callback_data: 'back_to_menu' }
          ]
        ]
      }
    });
  }
}

// ============ HANDLE PURCHASE ============

async function handlePurchase(chatId, role, price, userId, isBase = false) {
  if (isInMaintenance() && userId.toString() !== config.ownerId) {
    await sendMaintenanceMessage(chatId);
    return;
  }

  if (userId.toString() !== config.ownerId) {
    const isMember = await checkChannelMembership(userId);
    if (!isMember) {
      await sendJoinChannelMessage(chatId);
      return;
    }
  }

  const orderId = Date.now().toString().slice(-6);
  const username = (await bot.getChat(userId)).username || 'No username';
  
  let order;
  if (isBase) {
    order = addOrder(userId, username, role, price, orderId, null);
  } else {
    order = addOrder(userId, username, role, price, orderId, 'https://t.me/apksadapfreedd');
  }
  
  await sendOrderToChannel(order);
  await sendOrderConfirmation(userId, role, price, orderId, isBase);
  await sendPaymentNotification(userId, username, role, price, orderId);
  
  const productEmoji = isBase ? '📦' : 
                       role === 'MEMBER' ? '👥' :
                       role === 'RESS' ? '📦' : '👑';
  
  bot.sendMessage(chatId, `
✅ *Order #${orderId} berhasil dibuat!*

━━━━━━━━━━━━━━━━━━
${productEmoji} *Produk:* ${role}
💰 *Harga:* Rp ${price.toLocaleString()}

📱 *Cara bayar via QRIS DANA:*
1. Klik tombol QRIS di bawah
2. Scan QRIS atau transfer manual
3. Screenshot bukti transfer
4. Kirim ke bot ini (kirim foto)
5. Tunggu verifikasi

📢 *Orderan sudah masuk ke channel!*

💬 *GC: ${config.groupLink}*

🔥 *MAU ORDER JUGA? KLIK!*
  `, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📱 QRIS DANA', callback_data: 'show_qris' }
        ],
        [
          { text: '✅ Kirim Bukti TF', callback_data: 'send_proof' }
        ],
        [
          { text: '💬 GC', url: config.groupLink },
          { text: '👤 Hubungi Owner', callback_data: 'contact_owner' }
        ]
      ]
    }
  });
}

// ============ SEND ORDER CONFIRMATION ============

async function sendOrderConfirmation(userId, role, price, orderId, isBase = false) {
  let orderMessage = `
✅ *ORDER BERHASIL DIBUAT!* 🎉

━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* #${orderId}
📦 *Produk:* ${role}
💰 *Harga:* Rp ${price.toLocaleString()}
⏳ *Status:* Menunggu Pembayaran

📱 *Cara bayar via QRIS DANA:*

1️⃣ Klik tombol *QRIS DANA* di bawah
2️⃣ Scan QRIS atau transfer manual ke:
   📱 ${config.payment.dana.number}
   👤 a.n. ${config.payment.dana.name}
3️⃣ Screenshot bukti transfer
4️⃣ Kirim ke bot ini (kirim foto)
5️⃣ Tunggu verifikasi dari owner

`;

  if (isBase) {
    orderMessage += `
━━━━━━━━━━━━━━━━━━
⏳ *INFO BASE:*
• Pesanan sedang diproses
• File ZIP akan dikirim setelah verifikasi
• Proses bisa memakan waktu

🔈 *INFORMASI DARI OWNER* ${config.ownerUsername}
order base coy! 🔥
    `;
  } else {
    orderMessage += `
━━━━━━━━━━━━━━━━━━
🔈 *INFORMASI DARI OWNER* ${config.ownerUsername}
order coy! 🔥
    `;
  }

  orderMessage += `

💬 *GC: ${config.groupLink}*
💬 *Hubungi: ${config.ownerUsername}*
  `;

  try {
    await bot.sendMessage(userId, orderMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📱 QRIS DANA', callback_data: 'show_qris' }
          ],
          [
            { text: '✅ Kirim Bukti TF', callback_data: 'send_proof' }
          ],
          [
            { text: '💬 GC', url: config.groupLink },
            { text: '👤 Hubungi Owner', callback_data: 'contact_owner' }
          ]
        ]
      }
    });
    return true;
  } catch (error) {
    console.error('Error sending order confirmation:', error);
    return false;
  }
}

// ============ SEND ORDER TO CHANNEL ============
async function sendOrderToChannel(order) {
  const productEmoji = order.role === 'BASE' ? '📦' :
                       order.role === 'MEMBER' ? '👥' :
                       order.role === 'RESS' ? '📦' : '👑';
  
  let orderMessage = `
📢 *ORDERAN TERBARU!* 🔥
━━━━━━━━━━━━━━━━━━
${productEmoji} *Produk:* ${order.role}
🆔 *Order ID:* #${order.orderId}
👤 *User:* @${order.username || 'No username'}
💰 *Harga:* Rp ${order.price.toLocaleString()}
📅 *Waktu Order:* ${new Date(order.createdAt).toLocaleString('id-ID')}
⏳ *Status:* ${order.status}
`;

  if (order.role === 'BASE') {
    orderMessage += `
📦 *BASE ORDER:*
• Menunggu verifikasi
• File akan dikirim setelah pembayaran dikonfirmasi
    `;
  }

  orderMessage += `
━━━━━━━━━━━━━━━━━━
💳 *Pembayaran via DANA:*
📱 ${config.payment.dana.number}
👤 a.n. ${config.payment.dana.name}

⚠️ *Kirim bukti TF ke owner!*
💬 *Hubungi: ${config.ownerUsername}*

💬 *GC: ${config.groupLink}*

🔥 *MAU ORDER JUGA? KLIK!*
  `;

  try {
    await bot.sendMessage(config.orderChannel, orderMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔥 MAU ORDER JUGA? KLIK!', callback_data: 'back_to_menu' }
          ],
          [
            { text: '💬 GC', url: config.groupLink },
            { text: '👤 Hubungi Owner', callback_data: 'contact_owner' }
          ]
        ]
      }
    });
    return true;
  } catch (error) {
    console.error('Error sending to channel:', error);
    return false;
  }
}

// ============ SEND PAYMENT NOTIFICATION TO OWNER ============

async function sendPaymentNotification(userId, username, role, price, orderId, proofMessage = null) {
  const ownerId = config.ownerId;
  
  let notification = `
🔔 *NOTIFIKASI PEMBAYARAN!*
━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* #${orderId}
👤 *User:* @${username || 'No username'}
🆔 *User ID:* ${userId}
📦 *Produk:* ${role}
💰 *Harga:* Rp ${price.toLocaleString()}
📅 *Waktu:* ${new Date().toLocaleString('id-ID')}

💳 *Pembayaran via DANA:*
📱 ${config.payment.dana.number}
👤 a.n. ${config.payment.dana.name}

📌 *Status: Menunggu Verifikasi*
  `;

  if (role === 'BASE') {
    notification += `
━━━━━━━━━━━━━━━━━━
📦 *BASE ORDER:*
• Kirim 2 file ZIP ke bot
• Nanti bot akan kirim otomatis ke user
    `;
  }

  if (proofMessage) {
    notification += `
📎 *Bukti Transfer:*
${proofMessage}
    `;
  }

  notification += `
━━━━━━━━━━━━━━━━━━
⚠️ *Segera verifikasi pembayaran!*
  `;

  try {
    await bot.sendMessage(ownerId, notification, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Verifikasi', callback_data: `verify_${orderId}` },
            { text: '❌ Tolak', callback_data: `reject_${orderId}` }
          ],
          [
            { text: '💬 Chat User', url: `tg://user?id=${userId}` }
          ]
        ]
      }
    });
    return true;
  } catch (error) {
    console.error('Error sending notification:', error);
    return false;
  }
}

// ============ CALLBACK QUERY HANDLER ============

bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;

  await bot.answerCallbackQuery(callbackQuery.id);

  if (isInMaintenance() && userId.toString() !== config.ownerId) {
    await sendMaintenanceMessage(chatId);
    return;
  }

  // Handle verify
  if (data.startsWith('verify_')) {
    const orderId = data.replace('verify_', '');
    const order = orders.find(o => o.orderId === orderId);
    
    if (order) {
      updateOrderStatus(orderId, 'Selesai', order.paidAt || new Date().toISOString(), new Date().toISOString());
      
      let userMessage = `
✅ *PEMBAYARAN DIVERIFIKASI!* 🎉

━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* #${orderId}
📦 *Produk:* ${order.role}
💰 *Harga:* Rp ${order.price.toLocaleString()}
📅 *Waktu Verifikasi:* ${new Date().toLocaleString('id-ID')}

🎉 *Selamat! Pembayaran Anda sudah dikonfirmasi!*
      `;

      if (order.role === 'BASE') {
        if (order.baseFiles && order.baseFiles.length > 0) {
          userMessage += `
━━━━━━━━━━━━━━━━━━
📦 *BASE ZYRIX PLP*

✅ *File BASE sudah siap!*

📌 *File yang diterima:*
          `;
          
          for (const file of order.baseFiles) {
            userMessage += `• ${file.fileName || 'File ZIP'}\n`;
          }

          userMessage += `
📌 *Cara Install:*
1. Download semua file
2. Extract ZIP
3. Setting API
4. Siap digunakan!

━━━━━━━━━━━━━━━━━━
🔈 *INFORMASI DARI OWNER* ${config.ownerUsername}
base siap coy! 🔥
          `;

          await bot.sendMessage(order.userId, userMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '📢 Channel', url: config.channelLink },
                  { text: '💬 GC', url: config.groupLink }
                ],
                [
                  { text: '👤 Hubungi Owner', callback_data: 'contact_owner' },
                  { text: '📱 Menu Utama', callback_data: 'back_to_menu' }
                ]
              ]
            }
          });

          for (const file of order.baseFiles) {
            try {
              await bot.sendDocument(order.userId, file.fileId, {
                caption: `📦 ${file.fileName || 'File BASE'}`
              });
            } catch (error) {
              console.error('Error sending base file:', error);
            }
          }

        } else {
          userMessage += `
━━━━━━━━━━━━━━━━━━
⏳ *BASE Sedang Diproses...*

📦 *Pesanan BASE sedang disiapkan!*
⏳ *Mohon tunggu sebentar...*

📌 *File akan dikirim otomatis oleh bot*

━━━━━━━━━━━━━━━━━━
🔈 *INFORMASI DARI OWNER* ${config.ownerUsername}
base lagi diproses coy! 🔥
          `;

          await bot.sendMessage(order.userId, userMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '📢 Channel', url: config.channelLink },
                  { text: '💬 GC', url: config.groupLink }
                ],
                [
                  { text: '👤 Hubungi Owner', callback_data: 'contact_owner' },
                  { text: '📱 Menu Utama', callback_data: 'back_to_menu' }
                ]
              ]
            }
          });

          const ownerNotif = `
📦 *BASE ORDER - KIRIM FILE!*

━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* #${orderId}
👤 *User:* @${order.username || 'No username'}
📦 *Produk:* BASE

📌 *Instruksi:*
Kirim 2 file ZIP ke bot ini
Bot akan otomatis mengirim ke user

⚠️ *Kirim file sekarang!*
          `;

          await bot.sendMessage(config.ownerId, ownerNotif, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '💬 Chat User', url: `tg://user?id=${order.userId}` }
                ]
              ]
            }
          });
        }
      } else {
        userMessage += `
━━━━━━━━━━━━━━━━━━
🔗 *Akses link berikut:*
[KLIK DI SINI](${order.link || 'https://t.me/apksadapfreedd'})

📌 *Fitur yang didapat:*
• Akses Private Channel
• Support 24/7
• Update Terbaru

━━━━━━━━━━━━━━━━━━
🔈 *INFORMASI DARI OWNER* ${config.ownerUsername}
order coy! 🔥

💬 *Hubungi: ${config.ownerUsername}*
        `;

        await bot.sendMessage(order.userId, userMessage, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📢 Channel', url: config.channelLink },
                { text: '💬 GC', url: config.groupLink }
              ],
              [
                { text: '👤 Hubungi Owner', callback_data: 'contact_owner' },
                { text: '📱 Menu Utama', callback_data: 'back_to_menu' }
              ]
            ]
          }
        });
      }

      const orderMessage = `
✅ *ORDER SELESAI!* 🎉
━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* #${orderId}
👤 *User:* @${order.username || 'No username'}
📦 *Produk:* ${order.role}
💰 *Harga:* Rp ${order.price.toLocaleString()}
📅 *Selesai:* ${new Date().toLocaleString('id-ID')}

✅ *Status: SELESAI*
${order.role === 'BASE' ? '📦 BASE telah dikirim ke user' : '🔗 Link telah dikirim ke user'}

💬 *GC: ${config.groupLink}*
      `;

      await bot.sendMessage(config.orderChannel, orderMessage, {
        parse_mode: 'Markdown'
      });

      bot.sendMessage(chatId, `✅ Order #${orderId} berhasil diverifikasi!`);
      
    } else {
      bot.sendMessage(chatId, '❌ Order tidak ditemukan!');
    }
  }

  // Handle reject
  if (data.startsWith('reject_')) {
    const orderId = data.replace('reject_', '');
    const order = orders.find(o => o.orderId === orderId);
    
    if (order) {
      updateOrderStatus(orderId, 'Ditolak');
      
      const userMessage = `
❌ *PEMBAYARAN DITOLAK!*

━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* #${orderId}
📦 *Produk:* ${order.role}

⚠️ *Pembayaran ditolak karena:*
• Bukti transfer tidak jelas
• Nominal tidak sesuai
• Atau alasan lainnya

📌 *Silahkan order ulang atau hubungi owner!*

💬 *Hubungi: ${config.ownerUsername}*
      `;

      await bot.sendMessage(order.userId, userMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📱 Order Ulang', callback_data: 'back_to_menu' },
              { text: '💬 GC', url: config.groupLink }
            ],
            [
              { text: '👤 Hubungi Owner', callback_data: 'contact_owner' }
            ]
          ]
        }
      });

      const rejectMessage = `
❌ *ORDER DITOLAK!*
━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* #${orderId}
👤 *User:* @${order.username || 'No username'}
📦 *Produk:* ${order.role}
📅 *Ditolak:* ${new Date().toLocaleString('id-ID')}

❌ *Status: DITOLAK*
      `;

      await bot.sendMessage(config.orderChannel, rejectMessage, {
        parse_mode: 'Markdown'
      });

      bot.sendMessage(chatId, `❌ Order #${orderId} ditolak!`);
    }
  }

  // Handle check channel
  if (data === 'check_channel') {
    const isMember = await checkChannelMembership(userId);
    if (isMember) {
      bot.sendMessage(chatId, `
✅ *Berhasil! Kamu sudah join channel!*

📌 *Sekarang kamu bisa order!*
Klik /start untuk melihat menu

💬 *GC: ${config.groupLink}*

🔥 *Selamat berbelanja!*
    `, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📱 Menu Utama', callback_data: 'back_to_menu' },
              { text: '💬 GC', url: config.groupLink }
            ]
          ]
        }
      });
    } else {
      bot.sendMessage(chatId, `
❌ *Kamu belum join channel!*

📢 *Silahkan join channel dulu:*
${config.channelLink}

📌 *Cara:*
1. Klik tombol JOIN CHANNEL
2. Klik Join
3. Klik CEK STATUS lagi

💬 *GC: ${config.groupLink}*

🔈 *INFORMASI DARI OWNER* ${config.ownerUsername}
join dulu coy! 🔥
    `, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📢 JOIN CHANNEL', url: config.channelLink }
            ],
            [
              { text: '✅ CEK STATUS', callback_data: 'check_channel' }
            ],
            [
              { text: '💬 GC', url: config.groupLink }
            ]
          ]
        }
      });
    }
  }

  // Handle other callbacks
  switch(data) {
    case 'buy_member':
      await handlePurchase(chatId, 'MEMBER', config.prices.member, userId, false);
      break;
      
    case 'buy_ress':
      await handlePurchase(chatId, 'RESS', config.prices.ress, userId, false);
      break;
      
    case 'buy_owner':
      await handlePurchase(chatId, 'OWNER', config.prices.owner, userId, false);
      break;
      
    case 'buy_base':
      await handlePurchase(chatId, 'BASE', config.prices.base, userId, true);
      break;
      
    case 'show_qris':
      await showQRIS(chatId);
      break;
      
    case 'send_proof':
      bot.sendMessage(chatId, `
📸 *Kirim Bukti Transfer*

Silahkan kirim *SCREENSHOT/FOTO* bukti transfer DANA Anda ke:
📱 ${config.payment.dana.number}
👤 a.n. ${config.payment.dana.name}

📌 *Cara kirim:*
1. Kirim foto bukti transfer
2. Sertakan *Order ID* Anda
3. Tunggu verifikasi dari owner

⚠️ *Pastikan foto jelas ya!*

💬 *GC: ${config.groupLink}*
    `, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '💬 GC', url: config.groupLink },
              { text: '🔙 Kembali ke Menu', callback_data: 'back_to_menu' }
            ]
          ]
        }
      });
      break;
      
    case 'contact_owner':
      bot.sendMessage(chatId, `
👤 *Contact Owner* ${config.ownerUsername}

📱 Hubungi owner untuk info lebih lanjut:
Telegram: ${config.ownerUsername}

💬 *Atau klik tombol di bawah:*

💬 *GC: ${config.groupLink}*
      `, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📱 Chat Owner', url: `https://t.me/${config.ownerUsername.replace('@', '')}` }
            ],
            [
              { text: '💬 GC', url: config.groupLink },
              { text: '🔙 Kembali ke Menu', callback_data: 'back_to_menu' }
            ]
          ]
        }
      });
      break;
      
    case 'back_to_menu':
      bot.emit('text', {
        chat: { id: chatId },
        from: { id: userId },
        text: '/start'
      });
      break;
  }
});

// ============ HANDLE PHOTO (Bukti Transfer) ============

bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username;
  const caption = msg.caption || '';

  if (isInMaintenance() && userId.toString() !== config.ownerId) {
    await sendMaintenanceMessage(chatId);
    return;
  }

  const pendingOrder = orders.find(o => o.userId === userId && o.status === 'Menunggu Pembayaran');
  
  if (pendingOrder) {
    const ownerId = config.ownerId;
    const photo = msg.photo[msg.photo.length - 1];
    const fileId = photo.file_id;

    let notification = `
📸 *BUKTI TRANSFER MASUK!*
━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* #${pendingOrder.orderId}
👤 *User:* @${username || 'No username'}
🆔 *User ID:* ${userId}
📦 *Produk:* ${pendingOrder.role}
💰 *Harga:* Rp ${pendingOrder.price.toLocaleString()}
📅 *Waktu:* ${new Date().toLocaleString('id-ID')}

📝 *Caption:* ${caption || 'Tidak ada keterangan'}

💳 *Pembayaran via DANA:*
📱 ${config.payment.dana.number}
👤 a.n. ${config.payment.dana.name}

⚠️ *Segera verifikasi pembayaran!*
    `;

    if (pendingOrder.role === 'BASE') {
      notification += `
━━━━━━━━━━━━━━━━━━
📦 *BASE ORDER:*
• Setelah verifikasi, kirim 2 file ZIP
• Bot akan otomatis kirim ke user
      `;
    }

    try {
      await bot.sendPhoto(ownerId, fileId, {
        caption: notification,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Verifikasi', callback_data: `verify_${pendingOrder.orderId}` },
              { text: '❌ Tolak', callback_data: `reject_${pendingOrder.orderId}` }
            ],
            [
              { text: '💬 Chat User', url: `tg://user?id=${userId}` }
            ]
          ]
        }
      });

      bot.sendMessage(chatId, `
✅ *Bukti Transfer Diterima!*

📸 Bukti transfer sudah kami terima.
⏳ Mohon tunggu verifikasi dari owner.

📌 *Status:* Menunggu Verifikasi
💬 *Hubungi:* ${config.ownerUsername}

💬 *GC: ${config.groupLink}*

🔈 *INFORMASI DARI OWNER* ${config.ownerUsername}
order coy! 🔥
      `, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '💬 GC', url: config.groupLink },
              { text: '👤 Hubungi Owner', callback_data: 'contact_owner' }
            ],
            [
              { text: '🔙 Kembali ke Menu', callback_data: 'back_to_menu' }
            ]
          ]
        }
      });

    } catch (error) {
      console.error('Error sending proof to owner:', error);
      bot.sendMessage(chatId, '❌ Gagal mengirim bukti. Silahkan hubungi owner langsung!');
    }
  } else {
    bot.sendMessage(chatId, `
❌ *Tidak ada order pending!*

Silahkan buat order terlebih dahulu dengan klik /start

💬 *GC: ${config.groupLink}*
    `, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📱 Menu Utama', callback_data: 'back_to_menu' },
            { text: '💬 GC', url: config.groupLink }
          ]
        ]
      }
    });
  }
});

// ============ HANDLE DOCUMENT (Owner Kirim File BASE) ============

bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const document = msg.document;
  const caption = msg.caption || '';

  if (userId.toString() !== config.ownerId) {
    bot.sendMessage(chatId, '❌ Anda tidak memiliki akses!');
    return;
  }

  const pendingBaseOrder = orders.find(o => o.role === 'BASE' && o.status === 'Selesai' && (!o.baseFiles || o.baseFiles.length < 2));

  if (!pendingBaseOrder) {
    bot.sendMessage(chatId, `
❌ *Tidak ada order BASE yang menunggu file!*

📌 *Pastikan:*
• Ada order BASE yang sudah diverifikasi
• Belum dikirim file-nya
• Status order 'Selesai'
    `);
    return;
  }

  const fileId = document.file_id;
  const fileName = document.file_name || `BASE_${pendingBaseOrder.orderId}.zip`;
  
  addBaseFileToOrder(pendingBaseOrder.orderId, fileId, fileName);

  const fileCount = pendingBaseOrder.baseFiles ? pendingBaseOrder.baseFiles.length : 0;

  bot.sendMessage(chatId, `
✅ *File BASE diterima!*

📦 *Order ID:* #${pendingBaseOrder.orderId}
📄 *File:* ${fileName}
📊 *Total file terkumpul:* ${fileCount}/2

${fileCount >= 2 ? '✅ *Semua file sudah lengkap!*' : '⏳ *Kirim file kedua...*'}
  `, { parse_mode: 'Markdown' });

  if (fileCount >= 2) {
    const userMessage = `
✅ *BASE ZYRIX PLP - SIAP!* 🎉

━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* #${pendingBaseOrder.orderId}
📦 *Produk:* BASE
💰 *Harga:* Rp ${pendingBaseOrder.price.toLocaleString()}

📦 *File BASE sudah siap!*
📌 *2 file ZIP akan dikirim sekarang*

📌 *Cara Install:*
1. Download semua file
2. Extract ZIP
3. Setting API
4. Siap digunakan!

━━━━━━━━━━━━━━━━━━
🔈 *INFORMASI DARI OWNER* ${config.ownerUsername}
base siap coy! 🔥

💬 *GC: ${config.groupLink}*
    `;

    await bot.sendMessage(pendingBaseOrder.userId, userMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📢 Channel', url: config.channelLink },
            { text: '💬 GC', url: config.groupLink }
          ],
          [
            { text: '👤 Hubungi Owner', callback_data: 'contact_owner' },
            { text: '📱 Menu Utama', callback_data: 'back_to_menu' }
          ]
        ]
      }
    });

    for (const file of pendingBaseOrder.baseFiles) {
      try {
        await bot.sendDocument(pendingBaseOrder.userId, file.fileId, {
          caption: `📦 ${file.fileName || 'File BASE'}`
        });
      } catch (error) {
        console.error('Error sending base file to user:', error);
      }
    }

    await bot.sendMessage(pendingBaseOrder.userId, `
✅ *TERIMA KASIH TELAH ORDER!* 🎉

━━━━━━━━━━━━━━━━━━
📦 *BASE ZYRIX PLP*
✅ *File sudah terkirim semua!*

📌 *Jangan lupa:*
• Join channel untuk update
• Support 24/7
• Gabung GC buat diskusi

💬 *GC: ${config.groupLink}*

━━━━━━━━━━━━━━━━━━
🔈 *INFORMASI DARI OWNER* ${config.ownerUsername}
terima kasih coy! 🔥
    `, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📢 Channel', url: config.channelLink },
            { text: '💬 GC', url: config.groupLink }
          ],
          [
            { text: '📱 Menu Utama', callback_data: 'back_to_menu' }
          ]
        ]
      }
    });

    await bot.sendMessage(config.orderChannel, `
✅ *BASE ORDER SELESAI!* 🎉
━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* #${pendingBaseOrder.orderId}
👤 *User:* @${pendingBaseOrder.username || 'No username'}
📦 *Produk:* BASE
💰 *Harga:* Rp ${pendingBaseOrder.price.toLocaleString()}

✅ *File BASE telah dikirim ke user!*

💬 *GC: ${config.groupLink}*
    `, { parse_mode: 'Markdown' });

    bot.sendMessage(chatId, `
✅ *Semua file sudah terkirim ke user!*

👤 *User:* @${pendingBaseOrder.username || 'No username'}
🆔 *Order ID:* #${pendingBaseOrder.orderId}

📦 *2 file ZIP sudah dikirim!*

🎉 *Order BASE selesai!*
    `, { parse_mode: 'Markdown' });
  }
});

// ============ BROADCAST ============

bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const message = match[1];

  if (userId.toString() === config.ownerId) {
    await sendBroadcast(message, chatId);
  } else {
    bot.sendMessage(chatId, '❌ Anda tidak memiliki akses untuk broadcast!');
  }
});

bot.onText(/^\/bc$/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (userId.toString() === config.ownerId) {
    bot.sendMessage(chatId, `
📢 *FITUR BROADCAST*

Gunakan:
/broadcast [pesan]

Contoh:
/broadcast order coy! 🔥

📊 *Total User:* ${users.length}

⚠️ *Pesan akan dikirim ke semua user!*
    `, { parse_mode: 'Markdown' });
  } else {
    bot.sendMessage(chatId, '❌ Fitur ini hanya untuk owner!');
  }
});

async function sendBroadcast(message, senderId) {
  if (users.length === 0) {
    bot.sendMessage(senderId, '❌ Belum ada user yang terdaftar!');
    return;
  }

  const broadcastMessage = `
🔈📢 *INFORMASI DARI OWNER* ${config.ownerUsername}

━━━━━━━━━━━━━━━━━━
${message}
━━━━━━━━━━━━━━━━━━

📌 *ZYRIX PLP PROJECT*
💬 *Hubungi: ${config.ownerUsername}*

🔥 *Gabung GC: ${config.groupLink}*
  `;

  let successCount = 0;
  let failCount = 0;

  await bot.sendMessage(senderId, `📤 *Broadcast sedang dikirim...*\n\nTotal user: ${users.length}`, {
    parse_mode: 'Markdown'
  });

  for (const user of users) {
    try {
      await bot.sendMessage(user.id, broadcastMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📱 Menu Utama', callback_data: 'back_to_menu' },
              { text: '💬 GC', url: config.groupLink }
            ],
            [
              { text: '👤 Hubungi Owner', callback_data: 'contact_owner' }
            ]
          ]
        }
      });
      successCount++;
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (error) {
      failCount++;
    }
  }

  bot.sendMessage(senderId, `
✅ *Broadcast Selesai!*

📊 *Laporan:*
• Berhasil: ${successCount} user
• Gagal: ${failCount} user
• Total: ${users.length} user
  `, { parse_mode: 'Markdown' });
}

// ============ OTHER COMMANDS ============

bot.onText(/\/users/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (userId.toString() === config.ownerId) {
    let userList = `📊 *Total User:* ${users.length}\n\n`;
    
    const recentUsers = users.slice(-10);
    recentUsers.forEach((user, index) => {
      userList += `${index + 1}. @${user.username || 'No username'} (ID: ${user.id})\n`;
    });

    if (users.length > 10) {
      userList += `\n... dan ${users.length - 10} user lainnya`;
    }

    bot.sendMessage(chatId, userList, { parse_mode: 'Markdown' });
  } else {
    bot.sendMessage(chatId, '❌ Anda tidak memiliki akses!');
  }
});

bot.onText(/\/orders/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (userId.toString() === config.ownerId) {
    if (orders.length === 0) {
      bot.sendMessage(chatId, '📭 Belum ada order!');
      return;
    }

    let orderList = `📋 *DAFTAR ORDER*\n━━━━━━━━━━━━━━━━━━\n\n`;
    
    const recentOrders = orders.slice(-10).reverse();
    recentOrders.forEach((order, index) => {
      orderList += `${index + 1}. #${order.orderId} | ${order.role} | ${order.status}\n`;
      orderList += `   👤 @${order.username} | Rp ${order.price.toLocaleString()}\n`;
      if (order.role === 'BASE' && order.baseFiles) {
        orderList += `   📦 File: ${order.baseFiles.length}/2\n`;
      }
      orderList += `\n`;
    });

    if (orders.length > 10) {
      orderList += `\n... dan ${orders.length - 10} order lainnya`;
    }

    orderList += `\n━━━━━━━━━━━━━━━━━━\n📊 *Total Order:* ${orders.length}`;

    bot.sendMessage(chatId, orderList, { parse_mode: 'Markdown' });
  } else {
    bot.sendMessage(chatId, '❌ Anda tidak memiliki akses!');
  }
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `
📚 *Menu Bantuan*

📌 *User Commands:*
/start - Tampilkan menu utama
/price - Lihat daftar harga
/help - Bantuan ini

📌 *Owner Commands:*
/bc - Panduan broadcast
/broadcast [pesan] - Kirim pesan ke semua user
/users - Lihat daftar user
/orders - Lihat daftar order
/maintenance - Aktifkan mode maintenance
/offmaintenance - Matikan mode maintenance
/status - Cek status bot

💡 *Cara order:*
1. Pilih produk di menu
2. Bayar via QRIS DANA
3. Kirim bukti TF
4. Tunggu verifikasi

💬 *GC: ${config.groupLink}*
📞 *Support:* ${config.ownerUsername}
  `, { parse_mode: 'Markdown' });
});

bot.onText(/\/price/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `
💲 *Daftar Harga*
━━━━━━━━━━━━━━━━━━
👥 MEMBER  : Rp ${config.prices.member.toLocaleString()}
📦 RESS    : Rp ${config.prices.ress.toLocaleString()}
👑 OWNER   : Rp ${config.prices.owner.toLocaleString()}
📦 BASE    : Rp ${config.prices.base.toLocaleString()}

💳 *Pembayaran via QRIS DANA:*
📱 ${config.payment.dana.number}
👤 a.n. ${config.payment.dana.name}

📦 *BASE Package:*
• 2 File ZIP
• API Server
• Support 24/7

💬 *GC: ${config.groupLink}*

🔥 *MAU ORDER? KLIK /start*

👤 *Owner: ${config.ownerUsername}*
  `, { parse_mode: 'Markdown' });
});

// ============ ERROR HANDLING ============

bot.on('error', (error) => {
  console.error('Bot error:', error);
});

console.log('🤖 ZYRIX PLP PROJECT Bot Started!');
console.log(`👤 Owner: ${config.ownerUsername}`);
console.log(`💳 DANA: ${config.payment.dana.number} a.n. ${config.payment.dana.name}`);
console.log(`📢 Order Channel: ${config.orderChannel}`);
console.log(`💬 GC: ${config.groupLink}`);
console.log(`🔧 Maintenance Mode: ${isMaintenance ? 'AKTIF' : 'NONAKTIF'}`);
console.log('📱 Bot is running...');
