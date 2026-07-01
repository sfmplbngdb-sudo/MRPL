// ===================== AUTH =====================

async function redirectIfLoggedIn(){
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) window.location.href = "app.html";
}
redirectIfLoggedIn();

const loginForm  = document.getElementById("loginForm");
const loginMsg   = document.getElementById("loginMsg");
const signupForm = document.getElementById("signupForm");
const signupMsg  = document.getElementById("signupMsg");
const showSignup = document.getElementById("showSignup");

showSignup?.addEventListener("click", (e)=>{
  e.preventDefault();
  loginForm.classList.toggle("hidden");
  signupForm.classList.toggle("hidden");
  showSignup.textContent = loginForm.classList.contains("hidden") ? "Back to sign in" : "Create one";
});

loginForm?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  loginMsg.textContent = "Signing in…";
  loginMsg.className = "login-msg";
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error){
    loginMsg.textContent = error.message;
    loginMsg.className = "login-msg err";
    return;
  }
  loginMsg.textContent = "Signed in. Redirecting…";
  loginMsg.className = "login-msg ok";
  window.location.href = "app.html";
});

signupForm?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  signupMsg.textContent = "Creating account…";
  signupMsg.className = "login-msg";
  const email = document.getElementById("suEmail").value.trim();
  const password = document.getElementById("suPassword").value;

  const { error } = await supabaseClient.auth.signUp({ email, password });
  if (error){
    signupMsg.textContent = error.message;
    signupMsg.className = "login-msg err";
    return;
  }
  signupMsg.textContent = "Account created. Check email if confirmation is required, then sign in.";
  signupMsg.className = "login-msg ok";
});

async function requireAuth(){
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session){
    window.location.href = "index.html";
    return null;
  }
  return session;
}

async function logout(){
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
}
