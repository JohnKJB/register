import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore, collection, addDoc, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
    signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";



// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyA1tZP8Ej3KDQdogFkwQvVDMKa12MGBm1Q",
    authDomain: "e-register-8ca6c.firebaseapp.com",
    projectId: "e-register-8ca6c",
    storageBucket: "e-register-8ca6c.firebasestorage.app",
    messagingSenderId: "221366287264",
    appId: "1:221366287264:web:f212dd1bf27c1e102cc2c5",
    measurementId: "G-YF3HMN8L9Q"
};

// Initialize Firebase
const analytics = getAnalytics(app);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const recordsCollection = collection(db, "attendance_records");

let currentUser = null;
let unsubscribeLiveSync = null;

const LAST_SAVE_KEY = "ashford_last_save_at";
const SAVE_COOLDOWN_MS = 60 * 60 * 1000;



const STORAGE_KEY = "attendance_records";


const SCHOOL_LOCATION = { lat: 0.3, lng: 32 };
const ALLOWED_RADIUS_METERS = 50000000;

function getCurrentPosition(options) {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject({ code: 0, message: "Geolocation isn't supported by this browser." });
            return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
}

// Haversine formula: distance in metres between two lat/lng points.
function getDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth's radius in metres
    const toRad = deg => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

async function handleFindCoords() {
    const btn = document.getElementById("find-coords-btn");
    const output = document.getElementById("coords-output");
    btn.disabled = true;
    output.textContent = "Getting your location...";

    try {
        const position = await getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);
        const accuracy = Math.round(position.coords.accuracy);
        output.textContent = `lat: ${lat}, lng: ${lng}  (accuracy ±${accuracy}m)`;
    } catch (err) {
        output.textContent = geoErrorMessage(err);
    } finally {
        btn.disabled = false;
    }
}

function geoErrorMessage(err) {
    switch (err.code) {
        case 1: return "Location permission was denied — you need to allow location access to register.";
        case 2: return "Your location couldn't be determined. Try again with location services on.";
        case 3: return "Location check timed out. Try again.";
        default: return err.message || "Couldn't check your location.";
    }
}

function getRecords() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch (e) {
        return [];
    }
}

function saveRecords(records) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

// Local cache kept in sync with Firestore in real time — every device
// sees the same list, and it updates live as other devices save too.
let liveRecords = [];

function startLiveSync() {
    if (unsubscribeLiveSync) return; // already listening
    const q = query(recordsCollection, orderBy("savedAt", "desc"));
    unsubscribeLiveSync = onSnapshot(q, snapshot => {
        liveRecords = snapshot.docs.map(doc => doc.data());
        renderList();
    }, err => {
        document.getElementById("student-list").innerHTML =
            `<div class="empty-state">Couldn't load the register: ${err.message}</div>`;
    });
}

function stopLiveSync() {
    if (unsubscribeLiveSync) {
        unsubscribeLiveSync();
        unsubscribeLiveSync = null;
    }
    liveRecords = [];
}

function authErrorMessage(err) {
    switch (err.code) {
        case "auth/email-already-in-use": return "An account already exists for that email — try signing in instead.";
        case "auth/invalid-email": return "Enter a valid email address.";
        case "auth/weak-password": return "Password must be at least 6 characters.";
        case "auth/invalid-credential":
        case "auth/wrong-password":
        case "auth/user-not-found": return "Incorrect email or password.";
        default: return err.message || "Something went wrong. Try again.";
    }
}

async function handleSignUp() {
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;
    const status = document.getElementById("auth-status");
    status.className = "entry-status";
    try {
        await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
        status.textContent = authErrorMessage(err);
        status.classList.add("err");
    }
}

async function handleSignIn() {
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;
    const status = document.getElementById("auth-status");
    status.className = "entry-status";
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        status.textContent = authErrorMessage(err);
        status.classList.add("err");
    }
}

async function handleSignOut() {
    await signOut(auth);
}

onAuthStateChanged(auth, user => {
    currentUser = user;
    const authForm = document.getElementById("auth-form");
    const signedInBox = document.getElementById("auth-signed-in");
    const authTitle = document.getElementById("auth-title");
    const registerSection = document.getElementById("register-section");

    if (user) {
        authForm.style.display = "none";
        signedInBox.style.display = "flex";
        authTitle.textContent = "Account";
        document.getElementById("auth-email-display").textContent = user.email;
        registerSection.style.display = "block";
        document.getElementById("auth-email").value = "";
        document.getElementById("auth-password").value = "";
        document.getElementById("auth-status").textContent = "";
        startLiveSync();
    } else {
        authForm.style.display = "block";
        signedInBox.style.display = "none";
        authTitle.textContent = "Sign In";
        registerSection.style.display = "none";
        stopLiveSync();
    }
});

// function getLastSaveTime() {
//     const v = localStorage.getItem(LAST_SAVE_KEY);
//     return v ? new Date(v) : null;
// }

// function setLastSaveTime(date) {
//     localStorage.setItem(LAST_SAVE_KEY, date.toISOString());
// }

// function formatRemaining(ms) {
//     const totalMinutes = Math.ceil(ms / 60000);
//     const hours = Math.floor(totalMinutes / 60);
//     const minutes = totalMinutes % 60;
//     if (hours > 0) return `${hours}h ${minutes}m`;
//     return `${minutes}m`;
// }


function fmtSavedTime(iso) {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function updateEnrolled() {
    document.getElementById("enrolled-count").textContent =
        `${liveRecords.length} student${liveRecords.length !== 1 ? "s" : ""} registered`;
}

function renderList() {
    const list = document.getElementById("student-list");

    if (liveRecords.length === 0) {
        list.innerHTML = `<div class="empty-state">No students have registered for this session yet.</div>`;
        updateEnrolled();
        return;
    }

    list.innerHTML = records.map((r, idx) => `
        <div class="student-row">
          <span class="row-num">${String(idx + 1).padStart(2, "0")}</span>
          <span class="row-name">${r.name}</span>
          <span class="row-id mono">${r.studentId}</span>
          <span class="row-programme">${r.programme || "—"}</span>
          <span class="row-time mono">${r.savedAt}</span>
        </div>
      `).join("");
    updateEnrolled();
}

async function handleSave() {
    const nameInput = document.getElementById("entry-name");
    const idInput = document.getElementById("entry-id");
    const programmeInput = document.getElementById("entry-programme");
    const status = document.getElementById("entry-status");
    const saveBtn = document.getElementById("save-btn")

    if (!currentUser) {
        status.textContent = "Sign in first to register.";
        status.classList.add("err");
        return;
    }

    const name = nameInput.value.trim();
    const studentId = idInput.value.trim();
    const programme = programmeInput.value.trim();

    status.className = "entry-status";
    if (!name || !studentId) {
        status.textContent = "Enter your full name and student ID first.";
        status.classList.add("err");
        return;
    }

    // const records = getRecords();
    // const duplicate = records.find(r => r.studentId.toLowerCase() === studentId.toLowerCase());
    // if (duplicate) {
    //     status.textContent = `You're already registered (saved at ${fmtSavedTime(duplicate.savedAt)}).`;
    //     status.classList.add("err");
    //     return;
    // }

    const lastSave = getLastSaveTime();
    if (lastSave) {
        const elapsed = Date.now() - lastSave.getTime();
        if (elapsed < SAVE_COOLDOWN_MS) {
            status.textContent = `This device already registered recently. Try again in ${formatRemaining(SAVE_COOLDOWN_MS - elapsed)}.`;
            status.classList.add("err");
            return;
        }
    }

    const duplicate = liveRecords.find(r => r.studentId.toLowerCase() === studentId.toLowerCase());
    if (duplicate) {
        status.textContent = `You're already registered (saved at ${fmtSavedTime(duplicate.savedAt)}).`;
        status.classList.add("err");
        return;
    }

    saveBtn.disabled = true;
    const originalBtnText = saveBtn.textContent;
    saveBtn.textContent = "Checking location...";
    status.textContent = "Checking that you're on campus...";

    let position;
    try {
        position = await getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
    } catch (err) {
        status.textContent = geoErrorMessage(err);
        status.classList.add("err");
        saveBtn.disabled = false;
        saveBtn.textContent = originalBtnText;
        return;
    }

    const distance = getDistanceMeters(
        position.coords.latitude,
        position.coords.longitude,
        SCHOOL_LOCATION.lat,
        SCHOOL_LOCATION.lng
    );

    if (distance > ALLOWED_RADIUS_METERS) {
        status.textContent = `You're about ${Math.round(distance)}m from campus — you need to be within ${ALLOWED_RADIUS_METERS}m to register.`;
        status.classList.add("err");
        saveBtn.disabled = false;
        saveBtn.textContent = originalBtnText;
        return;
    }

    // records.push({
    //     name,
    //     studentId,
    //     programme,
    //     date: document.getElementById("date").value,
    //     time: document.getElementById("time").value,
    //     savedAt: new Date().toISOString()
    // });

    try {
        await addDoc(recordsCollection, {
            name,
            studentId,
            programme,
            email: currentUser ? currentUser.email : null,
            date: document.getElementById("date").value,
            time: document.getElementById("time").value,
            savedAt: new Date().toISOString()
        });

    } catch (err) {
        status.textContent = `Couldn't save right now (${err.message}). Try again.`;
        status.classList.add("err");
        saveBtn.disabled = false;
        saveBtn.textContent = originalBtnText;
        return;
    }


    setLastSaveTime(new Date());

    status.textContent = `Saved — welcome, ${name}.`;
    status.classList.add("ok");

    nameInput.value = "";
    idInput.value = "";
    programmeInput.value = "";
    nameInput.focus();

    saveBtn.disabled = false;
    saveBtn.textContent = originalBtnText;
}
window.handleSave = handleSave;
window.handleFindCoords = handleFindCoords;
window.handleSignIn = handleSignIn;
window.handleSignUp = handleSignUp;
window.handleSignOut = handleSignOut;


document.getElementById("date").value = new Date().toISOString().slice(0, 10);