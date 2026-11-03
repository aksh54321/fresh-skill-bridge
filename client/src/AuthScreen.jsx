import { useState } from "react";
import { apiRequest } from "./api";

export default function AuthScreen({ bootstrapRequired, onAuthenticated, serviceError }) {
  const [mode, setMode] = useState(bootstrapRequired ? "bootstrap" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [bootstrapKey, setBootstrapKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const isBootstrap = mode === "bootstrap";
      const result = await apiRequest(
        isBootstrap ? "/api/auth/bootstrap" : "/api/auth/login",
        {
          method: "POST",
          headers: isBootstrap ? { "X-Bootstrap-Key": bootstrapKey } : {},
          body: JSON.stringify({ email, password }),
        }
      );
      onAuthenticated(result.user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand-mark">S</div>
        <p className="auth-eyebrow">STAFFSYNC · PEOPLE OPERATIONS</p>
        <h1>{mode === "bootstrap" ? "Set up your HR account" : "Welcome back"}</h1>
        <p className="auth-description">
          {mode === "bootstrap"
            ? "Create the first HR administrator account for this workspace."
            : "Sign in to securely access your StaffSync workspace."}
        </p>
        {(serviceError || error) && (
          <div className="auth-error" role="alert">{error || serviceError}</div>
        )}
        <form onSubmit={submit} className="auth-form">
          {mode === "bootstrap" && (
            <label>
              HR setup key
              <input
                type="password"
                required
                autoComplete="off"
                value={bootstrapKey}
                onChange={(event) => setBootstrapKey(event.target.value)}
                placeholder="Enter the key configured on the server"
              />
            </label>
          )}
          <label>
            Work email
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              minLength="12"
              maxLength="128"
              autoComplete={mode === "bootstrap" ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 12 characters"
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? "Please wait..." : mode === "bootstrap" ? "Create HR account" : "Sign in"}
          </button>
        </form>
        {bootstrapRequired && mode === "login" && (
          <button className="auth-mode-button" type="button" onClick={() => setMode("bootstrap")}>
            Set up the first HR account
          </button>
        )}
        {bootstrapRequired && mode === "bootstrap" && (
          <button className="auth-mode-button" type="button" onClick={() => setMode("login")}>
            Back to sign in
          </button>
        )}
      </section>
    </main>
  );
}
