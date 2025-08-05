// DOM Elements
const elements = {
  status: document.getElementById('status'),
  roastQuote: document.getElementById('roast-quote'),
  chat: document.getElementById('chat'),
  typingIndicator: document.getElementById('typing-indicator'),
  input: document.getElementById('messageInput'),
  sendBtn: document.getElementById('sendBtn'),
  startBtn: document.getElementById('startBtn'),
  skipBtn: document.getElementById('skipBtn')
};

// Sounds
const sounds = {
  message: new Audio('sounds/message.mp3'),
  connect: new Audio('sounds/connect.mp3'),
  disconnect: new Audio('sounds/disconnect.mp3')
};

document.addEventListener('click', () => {
  Object.values(sounds).forEach(sound => {
    sound.volume = 0.3;
    sound.muted = false;
    sound.play().then(() => sound.pause()).catch(e => console.log('Audio init error:', e));
  });
}, { once: true });

// Socket connection
const socket = io("https://roast-battle-arena-1.onrender.com", {
  transports: ["websocket"],
  auth: {
    username: localStorage.getItem("roastUsername"),
    avatar: localStorage.getItem("roastAvatar")
  },
  reconnectionAttempts: 5,
  reconnectionDelay: 3000,
  timeout: 10000
});

// Typing setup
const typingText = document.createElement('div');
typingText.className = 'typing-text';
typingText.textContent = 'is typing...';
elements.typingIndicator.appendChild(typingText);


let currentPartner = null;
let liveMessages = []; // Store current chat messages
let inLiveChat = true; // Are we chatting live or viewing history?
let partnerUsername = "Opponent";
let partnerAvatar = "https://api.dicebear.com/7.x/bottts/svg?seed=Opponent";
let partnerUid = null; // ✅ Store opponent's Firebase UID
let typingTimeout;
const TYPING_DELAY = 1500;

// Quotes
const QUOTES = {
  waiting: [
    "Training cyber-monkeys to find your match... 🐒💻",
    "Quantum snails routing your connection... 🐌⚛️",
    "Banana-powered servers warming up... 🍌🔥"
  ],
  roasting: [
    "You code like a drunk octopus 🐙🍸",
    "Your WiFi is powered by sleepy sloths 🦥⚡",
    "That comeback died faster than my pet rock 🪨💀"
  ]
};

// UI helpers
// In script.js

function addMessage(msg, sender) {
  const msgDiv = document.createElement('div');
  msgDiv.classList.add("message");
  msgDiv.classList.add(sender);

  // This block handles the opponent's messages
  if (sender === "stranger") {
    msgDiv.classList.add("stranger");
    // ✅ FIX: Add this line to attach the opponent's UID to their messages
    if (partnerUid) {
        msgDiv.setAttribute("data-with-uid", partnerUid);
    }
  }

  const yourUsername = localStorage.getItem('roastUsername');
  const yourAvatar = localStorage.getItem('roastAvatar');

  const isYou = sender === 'you';
  const displayAvatar = isYou ? yourAvatar : msg.avatar || partnerAvatar;
  const displayName = isYou ? yourUsername : msg.username || partnerUsername;

  msgDiv.innerHTML = `
    <div class="message-header">
      <img class="message-avatar" src="${displayAvatar}" />
      <span class="message-username">${displayName}</span>
    </div>
    <div>${msg.text}</div>
  `;

  elements.chat.appendChild(msgDiv);
  elements.chat.scrollTop = elements.chat.scrollHeight;
}
function resetUI() {
  elements.roastQuote.textContent = '';
  elements.chat.innerHTML = '';
  elements.typingIndicator.style.opacity = '0';
  elements.startBtn.style.display = 'block';
  elements.skipBtn.style.display = 'none';
  currentPartner = null;
}

function showRandomQuote(type) {
  const quote = QUOTES[type][Math.floor(Math.random() * QUOTES[type].length)];
  elements.roastQuote.textContent = quote;
}

function playSound(soundName) {
  try {
    sounds[soundName].currentTime = 0;
    sounds[soundName].play().catch(e => console.log(`${soundName} sound error:`, e));
  } catch (e) {
    console.log('Sound play failed:', e);
  }
}

function sendMessage() {
  const msg = elements.input.value.trim();
  if (!msg || !currentPartner) return;

  socket.emit("send_message", { text: msg });
  addMessage({ text: msg }, "you");
  (async () => {
  const db = window.firebaseDB;
  const auth = window.firebaseAuth;
  const user = auth?.currentUser;
  if (!user) return;

  const currentUsername = localStorage.getItem("roastUsername");
  const currentUserAvatar = localStorage.getItem("roastAvatar");

  try {
    const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js");

    // Save to personal messages
    await addDoc(collection(db, "users", user.uid, "messages"), {
      from: currentUsername,
      fromAvatar: currentUserAvatar,
      to: partnerUsername,
      toAvatar: partnerAvatar,
      text: msg,
      timestamp: Date.now(),
      withUid: partnerUid,
      uid: user.uid
    });

    // Save to global chat history
    await addDoc(collection(db, "chatMessages"), {
      from: currentUsername,
      fromAvatar: currentUserAvatar,
      to: partnerUsername,
      toAvatar: partnerAvatar,
      text: msg,
      timestamp: Date.now(),
      withUid: partnerUid,
      uid: user.uid
    });

    console.log("✅ Your message saved to chatMessages");
  } catch (err) {
    console.error("❌ Error saving your message:", err);
  }
})();

  elements.input.value = '';
  playSound('message');
  socket.emit('stop_typing');
  clearTimeout(typingTimeout);
  elements.typingIndicator.style.opacity = '0';
}

// Typing logic
elements.input.addEventListener('input', () => {
  if (elements.input.value.trim().length > 0) {
    socket.emit('typing');
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socket.emit('stop_typing');
    }, TYPING_DELAY);
  } else {
    socket.emit('stop_typing');
  }
});

// Socket events
socket.on('connection_update', (data) => {
  elements.status.textContent = `⚡ ${data.message}`;
});

socket.on('connect', () => {
  elements.status.textContent = "⚡ Connected to battle server";
  resetUI();
  showRandomQuote('waiting');
  playSound('connect');

  const auth = window.firebaseAuth;
  const user = auth?.currentUser;
  if (user) {
    socket.emit("set_profile", {
      username: localStorage.getItem("roastUsername"),
      avatar: localStorage.getItem("roastAvatar"),
      uid: user.uid
    });
  }
});


socket.on('connect_error', (err) => {
  elements.status.textContent = `⚠️ Connection failed: ${err.message}`;
});

socket.on('waiting', () => {
  resetUI();
  elements.status.textContent = "🔍 Scanning for opponents...";
  showRandomQuote('waiting');
});

socket.on('chat_start', (data) => {
  currentPartner = data.partnerId;
  partnerUid = data.partnerUid || "unknown";
  partnerUsername = data.partnerUsername || "Opponent";
  partnerAvatar = data.partnerAvatar || "https://api.dicebear.com/7.x/bottts/svg?seed=Opponent";

  // ✅ Save UID to popup for friend request system
  const popup = document.getElementById("user-popup");
  if (popup && data.partnerUid) {
    popup.setAttribute("data-uid", data.partnerUid);
  }

  elements.status.textContent = "⚡ BATTLE MODE ACTIVATED!";
  showRandomQuote('roasting');
  elements.startBtn.style.display = 'none';
  elements.skipBtn.style.display = 'block';
  playSound('connect');
});


socket.on('receive_message', async (msg) => {
  addMessage(msg, 'stranger');
  elements.typingIndicator.style.opacity = '0';
  playSound('message');

  // ✅ Save message to Firestore
  const auth = window.firebaseAuth;
  const db = window.firebaseDB;

  const user = auth?.currentUser;
  if (!user) return;

  const currentUsername = localStorage.getItem("roastUsername");
const currentUserAvatar = localStorage.getItem("roastAvatar");

  const yourUsername = localStorage.getItem("roastUsername");
  const yourAvatar = localStorage.getItem("roastAvatar");

  try {
    const { collection, addDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js");

// Save to personal messages
// When YOU send a message (in sendMessage()):
await addDoc(collection(db, "chatMessages"), {
  from: currentUsername,
  fromAvatar: currentUserAvatar,
  to: partnerUsername,
  text: msg,
  timestamp: Date.now(),
  uid: user.uid,       // Your UID
  withUid: partnerUid  // Opponent's UID
});

// When OPPONENT sends message (in receive_message):
await addDoc(collection(db, "chatMessages"), {
  from: partnerUsername,
  fromAvatar: partnerAvatar,
  to: currentUsername,
  text: msg.text,
  timestamp: Date.now(),
  uid: partnerUid,     // Opponent's UID
  withUid: user.uid    // Your UID
});




    console.log("📥 Message saved with from & to ✅");
  } catch (err) {
    console.error("❌ Error saving message:", err);
  }
});



socket.on('partner_left', (data) => {
  resetUI();
  elements.status.textContent = data.message;
  showRandomQuote('waiting');
  playSound('disconnect');
});

socket.on('partner_typing', () => {
  elements.typingIndicator.style.opacity = '1';
});

socket.on('partner_stopped_typing', () => {
  elements.typingIndicator.style.opacity = '0';
});

// Button events
elements.startBtn.addEventListener('click', () => {
  socket.emit('start_chat');
  elements.status.textContent = "🚀 Searching for opponent...";
});

elements.skipBtn.addEventListener('click', () => {
  socket.emit('skip_partner');
  elements.status.textContent = "🌀 Finding new opponent...";
});

elements.sendBtn.addEventListener('click', sendMessage);
elements.input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});




async function loadChatHistory(withUid, partnerName, partnerAvatarUrl) {
  elements.chat.innerHTML = '<div style="color:white;padding:10px;">⏳ Loading conversation...</div>';
  const user = window.firebaseAuth?.currentUser;
  const db = window.firebaseDB;
  if (!user || !db) return;
  inLiveChat = false;

const backBtn = document.createElement("button");
backBtn.textContent = "⬅️ Back to Live Chat";
backBtn.style.cssText = "margin: 10px; padding: 6px 12px; font-size: 14px; cursor: pointer;";
backBtn.onclick = () => {
  elements.chat.innerHTML = '';
  inLiveChat = true;
  liveMessages.forEach(msg => addMessage(msg, msg.sender));
};
elements.chat.appendChild(backBtn);


  
  try {
const { collection, query, where, orderBy, getDocs, or, and } = await import("https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js");


const q = query(
  collection(db, 'chatMessages'),
  or(
    and(where('uid', '==', user.uid), where('withUid', '==', withUid)),
    and(where('uid', '==', withUid), where('withUid', '==', user.uid))
  ),
  orderBy('timestamp', 'asc')
);


   const snapshot = await getDocs(q);
if (snapshot.empty) {
  elements.chat.innerHTML = '<div style="color:white;padding:10px;">No conversation found.</div>';
  return;
}

elements.chat.innerHTML = '';
snapshot.forEach(doc => {
  const data = doc.data();
  const isYou = data.uid === user.uid;

  addMessage({
    text: data.text,
    username: isYou ? localStorage.getItem("roastUsername") : partnerName,
    avatar: isYou ? localStorage.getItem("roastAvatar") : partnerAvatarUrl
  }, isYou ? 'you' : 'stranger');
});


elements.chat.innerHTML = '';
filteredMessages.forEach(data => {
  const isYou = data.from === localStorage.getItem("roastUsername");
    const sender = isYou ? "you" : "stranger"; // ✅ This determines alignment

  addMessage({
    text: data.text,
    username: isYou ? localStorage.getItem("roastUsername") : partnerName,
    avatar: isYou ? localStorage.getItem("roastAvatar") : partnerAvatarUrl
  }, sender);  // ✅ Uses the correct class for CSS alignment

});

  } catch (err) {
    console.error("⚠️ Failed to load history:", err);
    elements.chat.innerHTML = '<div style="color:white;padding:10px;">❌ Failed to load conversation.</div>';
  }
}




function loadFriendsSidebar() {
  const currentUser = firebase.auth().currentUser;
  if (!currentUser) return;

  const friendsListContainer = document.getElementById("friends-list");
  friendsListContainer.innerHTML = "<div>Loading friends...</div>";

  const db = firebase.firestore();
  db.collection("users")
    .doc(currentUser.uid)
    .collection("friends")
    .get()
    .then((querySnapshot) => {
      friendsListContainer.innerHTML = ""; // Clear loading
      if (querySnapshot.empty) {
        friendsListContainer.innerHTML = "<div>No friends found.</div>";
        return;
      }

      querySnapshot.forEach((doc) => {
        const friend = doc.data();
        const friendHtml = `
          <div class="friend-item">
            <div class="friend-avatar" style="background: #ff6347;">
              ${friend.username ? friend.username[0].toUpperCase() : "?"}
            </div>
            <div class="friend-info">
              <div class="friend-name">${friend.username || "Unknown"}</div>
              <div class="friend-status-message">🔥 Roaster</div>
            </div>
            <div class="status-dot online"></div>
          </div>
        `;
        friendsListContainer.innerHTML += friendHtml;
      });
    })
    .catch((error) => {
      console.error("Error loading friends:", error);
      friendsListContainer.innerHTML = "<div>Failed to load friends.</div>";
    });
}
function toggleSidebar() {
  const sidebar = document.getElementById("statusSidebar");
  sidebar.classList.toggle("active");
  if (sidebar.classList.contains("active")) {
    loadFriendsSidebar(); // 👈 loads friends when visible
  }
}




function toggleHistory() {
  const box = document.getElementById("chatHistoryBox");
  if (box.style.display === "none" || !box.style.display) {
    box.style.display = "block";
    showChatHistoryList(); // ✅ load chats when shown
  } else {
    box.style.display = "none";
  }
}




async function showChatHistoryList() {
  const user = window.firebaseAuth?.currentUser;
  const db = window.firebaseDB;
  if (!user || !db) return;

  const list = document.getElementById("chatHistoryList");
  list.innerHTML = "<div style='color:white;'>Loading chats...</div>";

  try {
    const { collection, query, where, orderBy, getDocs } = await import("https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js");

    const q = query(
      collection(db, "chatMessages"),
      where("uid", "==", user.uid),
      orderBy("timestamp", "desc")
    );

    const snapshot = await getDocs(q);
    const seen = new Set();
    list.innerHTML = "";

    snapshot.forEach(doc => {
      const msg = doc.data();
      const oppoUid = msg.withUid;
      if (seen.has(oppoUid)) return;
      seen.add(oppoUid);

      const yourUsername = localStorage.getItem("roastUsername");
      const oppoName = msg.from === yourUsername ? msg.to : msg.from;
      const oppoAvatar = msg.from === yourUsername ? msg.toAvatar : msg.fromAvatar;

      const div = document.createElement("div");
      div.className = "chat-history-entry";
      div.style.cssText = "display:flex;align-items:center;margin-bottom:8px;cursor:pointer;";
      div.innerHTML = `
        <img src="${oppoAvatar}" style="width:28px;height:28px;border-radius:50%;margin-right:10px;">
        <span style="color:white;">${oppoName}</span>
      `;
      div.onclick = () => {
        document.getElementById("chatHistoryBox").style.display = "none";
        loadChatHistory(oppoUid, oppoName, oppoAvatar);
      };

      list.appendChild(div);
    });

  } catch (err) {
    console.error("⚠️ Failed to load chat history list:", err);
    list.innerHTML = "<div style='color:white;'>❌ Error loading chats</div>";
  }
}




// Start
resetUI();
