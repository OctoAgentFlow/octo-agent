"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import axios from "axios";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { automationService, type AutoDMPreferenceData } from "@/services/automation.service";

type LoadState = "loading" | "ready" | "done" | "error";

export default function UnsubscribePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [state, setState] = useState<LoadState>("loading");
  const [preference, setPreference] = useState<AutoDMPreferenceData | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    automationService
      .getDMPreference(token)
      .then((data) => {
        if (cancelled) return;
        setPreference(data);
        setState(data.status === "unsubscribed" ? "done" : "ready");
      })
      .catch(() => {
        if (cancelled) return;
        setMessage("This unsubscribe link is invalid or expired.");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const unsubscribe = async () => {
    try {
      const data = await automationService.unsubscribeDM(token);
      setPreference(data);
      setState("done");
      setMessage("");
    } catch (error) {
      setMessage(axios.isAxiosError(error) ? error.response?.data?.message || "Unable to unsubscribe." : "Unable to unsubscribe.");
      setState("error");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader
          title="Auto DM Preferences"
          description={preference?.recipient_username ? `Preferences for ${preference.recipient_username}` : "Manage your Auto DM preference."}
        />
        {state === "loading" ? <p className="text-sm text-white/60">Loading...</p> : null}
        {state === "ready" ? (
          <div className="space-y-4">
            <p className="text-sm text-white/68">You can stop future Auto DM messages from this sender.</p>
            <Button onClick={unsubscribe}>Unsubscribe</Button>
          </div>
        ) : null}
        {state === "done" ? (
          <p className="rounded-md border border-emerald-300/20 bg-emerald-300/10 px-3 py-3 text-sm text-emerald-100">
            You are unsubscribed. Future Auto DM sends to this recipient are blocked.
          </p>
        ) : null}
        {state === "error" ? <p className="text-sm text-amber-100">{message}</p> : null}
      </Card>
    </main>
  );
}
