const USERS_KEY = "explorer_users";
const SESSION_KEY = "explorer_session";

const form = document.getElementById("authForm");
const title = document.getElementById("authTitle");
const message = document.getElementById("message");
const submitBtn = document.getElementById("submitBtn");
const modeButtons = document.querySelectorAll(".mode-btn");

const nameWrap = document.getElementById("nameWrap");
const nameInput = document.getElementById("name");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

let mode = "login";

function getUsers() {
  try {
    const parsed = JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function setMode(nextMode) {
  mode = nextMode;
  const signupMode = mode === "signup";

  modeButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });

  nameWrap.classList.toggle("hidden", !signupMode);
  nameInput.required = signupMode;
  title.textContent = signupMode ? "Create Your Explorer Account" : "Log In to Explorer";
  submitBtn.textContent = signupMode ? "Sign Up" : "Login";
  passwordInput.autocomplete = signupMode ? "new-password" : "current-password";
  setMessage("");
}

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value.trim();
  const fullName = nameInput.value.trim();
  const users = getUsers();

  if (!email || !password) {
    setMessage("Enter email and password.", true);
    return;
  }

  if (password.length < 6) {
    setMessage("Password must be at least 6 characters.", true);
    return;
  }

  if (mode === "signup") {
    if (!fullName) {
      setMessage("Enter your full name to sign up.", true);
      return;
    }

    const existing = users.find((user) => user.email === email);
    if (existing) {
      setMessage("Account already exists. Please log in.", true);
      setMode("login");
      return;
    }

    users.push({
      name: fullName,
      email,
      password,
    });
    setUsers(users);
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ name: fullName, email, loggedInAt: new Date().toISOString() }),
    );
    setMessage("Sign up successful. Redirecting...");
    form.reset();
    setTimeout(() => {
      window.location.href = "index.html#itinerary";
    }, 800);
    return;
  }

  const user = users.find((item) => item.email === email && item.password === password);
  if (!user) {
    setMessage("Invalid email or password.", true);
    return;
  }

  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ name: user.name, email, loggedInAt: new Date().toISOString() }),
  );
  setMessage("Login successful. Redirecting...");
  form.reset();
  setTimeout(() => {
    window.location.href = "index.html#itinerary";
  }, 800);
});
