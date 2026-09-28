"use client";

import { useEffect, useState } from "react";
import { accountCopy } from "@/lib/account-copy";
import type { Locale } from "@/lib/locales";

export default function Account() {
  const [mode,setMode]=useState<"login"|"register">("login");
  const [name,setName]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [rememberMe,setRememberMe]=useState(true);
  const [language,setLanguage]=useState<Locale>("nl");
  const t=accountCopy[language];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "register") setMode("register");
    const requested = params.get("lang");
    if (requested && requested in accountCopy) setLanguage(requested as Locale);
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.user) window.location.replace("/dashboard");
      })
      .catch(() => {});
  }, []);

  async function submit(e:React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    if (mode==="register" && !(password.length>=8 && /[A-Za-z]/.test(password) && /\\d/.test(password) && /[^A-Za-z0-9]/.test(password))) {
      setError(language==="nl"?"Gebruik minimaal 8 tekens met letters, 1 cijfer en 1 speciaal teken.":language==="de"?"Mindestens 8 Zeichen mit Buchstaben, 1 Zahl und 1 Sonderzeichen verwenden.":language==="fr"?"Utilisez au moins 8 caractères avec des lettres, 1 chiffre et 1 caractère spécial.":language==="it"?"Usa almeno 8 caratteri con lettere, 1 numero e 1 carattere speciale.":language==="es"?"Usa al menos 8 caracteres con letras, 1 número y 1 carácter especial.":"Use at least 8 characters with letters, 1 number and 1 special character.");
      setBusy(false); return;
    }

    if (mode==="register" && password!==confirmPassword) {
      setError(language==="nl"?"De wachtwoorden komen niet overeen.":language==="de"?"Die Passwörter stimmen nicht überein.":language==="fr"?"Les mots de passe ne correspondent pas.":language==="it"?"Le password non corrispondono.":language==="es"?"Las contraseñas no coinciden.":"The passwords do not match.");
      setBusy(false);
      return;
    }

    const endpoint=mode==="login"?"/api/auth/login":"/api/auth/register";
    const body=mode==="login"?{email,password,rememberMe,language}:{name,email,password,language};

    try {
      const r=await fetch(endpoint,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(body)
      });
      const d=await r.json();
      if(!r.ok){
        setError(d.error||(language==="nl"?"Actie mislukt.":language==="de"?"Aktion fehlgeschlagen.":language==="fr"?"L’action a échoué.":language==="it"?"Operazione non riuscita.":language==="es"?"La acción ha fallado.":"Action failed."));
        setBusy(false);
        return;
      }
      window.location.replace("/dashboard");
    } catch {
      setError(language==="nl"?"Er ging iets mis. Probeer het opnieuw.":language==="de"?"Etwas ist schiefgelaufen. Bitte versuche es erneut.":language==="fr"?"Une erreur s’est produite. Veuillez réessayer.":language==="it"?"Si è verificato un errore. Riprova.":language==="es"?"Se ha producido un error. Inténtalo de nuevo.":"Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0B1220] px-4 py-7 text-white sm:px-5 sm:py-12" lang={language}>
      <div className="mx-auto max-w-md">
        <a href={"/"+language} className="text-lg font-bold">RankFix <span className="text-emerald-300">AI</span></a>
        <div className="mt-8 rounded-3xl border border-[#334155] bg-[#101B2D] p-5 shadow-xl sm:mt-10 sm:p-7">
          <div className="flex rounded-xl bg-black/20 p-1">
            <button onClick={()=>setMode("login")} className={`flex-1 rounded-lg px-3 py-2 text-sm ${mode==="login"?"bg-white text-slate-950":"text-slate-400"}`}>{t.login}</button>
            <button onClick={()=>setMode("register")} className={`flex-1 rounded-lg px-3 py-2 text-sm ${mode==="register"?"bg-white text-slate-950":"text-slate-400"}`}>{t.register}</button>
          </div>

          <h1 className="mt-8 text-3xl font-black">{mode==="register"?t.start:t.welcome}</h1>
          <p className="mt-2 text-sm text-slate-400">
            {mode==="register"?t.startInfo:t.loginInfo}
          </p>

          <form onSubmit={submit} autoComplete="on" className="mt-7 space-y-4">
            {mode==="register"&&(
              <input required aria-label={t.name} value={name} onChange={e=>setName(e.target.value)} placeholder={t.name} autoComplete="name" className="w-full rounded-xl border border-[#334155] bg-[#16233A] px-4 py-3 text-base outline-none"/>
            )}
            <input required aria-label={t.email} type="email" value={email} onChange={e=>setEmail(e.target.value)} name="email" placeholder={t.email} autoComplete="username email" className="w-full rounded-xl border border-[#334155] bg-[#16233A] px-4 py-3 text-base outline-none"/>
            <input required aria-label={t.password} minLength={8} pattern={mode==="register"?"(?=.*[A-Za-z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,}":undefined} type="password" value={password} onChange={e=>setPassword(e.target.value)} name="password" placeholder={t.password} autoComplete={mode==="register"?"new-password":"current-password"} className="w-full rounded-xl border border-[#334155] bg-[#16233A] px-4 py-3 text-base outline-none"/>

            {mode==="register"&&<p className="text-xs text-slate-400">{language==="nl"?"Minimaal 8 tekens: letters + 1 cijfer + 1 speciaal teken.":language==="de"?"Mindestens 8 Zeichen: Buchstaben + 1 Zahl + 1 Sonderzeichen.":language==="fr"?"Au moins 8 caractères : lettres + 1 chiffre + 1 caractère spécial.":language==="it"?"Almeno 8 caratteri: lettere + 1 numero + 1 carattere speciale.":language==="es"?"Mínimo 8 caracteres: letras + 1 número + 1 carácter especial.":"At least 8 characters: letters + 1 number + 1 special character."}</p>}

            {mode==="login"&&(
              <div className="flex items-center justify-between gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={rememberMe} onChange={e=>setRememberMe(e.target.checked)} className="h-4 w-4 rounded" />
                  {t.remember}
                </label>
                <div>
                <a href={`/account/forgot-password?lang=${language}`} className="text-sm text-emerald-300 hover:text-emerald-200">{t.forgot}</a>
                </div>
              </div>
            )}

            {mode==="register"&&(
              <input required aria-label={t.confirm} minLength={8} type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder={t.confirm} autoComplete="new-password" className="w-full rounded-xl border border-[#334155] bg-[#16233A] px-4 py-3 text-base outline-none"/>
            )}

            {error&&<div role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}

            <button disabled={busy} className="min-h-12 w-full rounded-xl bg-[#5DCAA5] px-4 py-3 font-bold text-[#04342C] disabled:opacity-50">
              {busy?t.busy:mode==="register"?t.submitRegister:t.submitLogin}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
