export interface Agent {
  id: number;
  name: string;
  model: string;
  type: "post" | "reply" | "dm" | string;
  state: string;
  enabled: boolean;
  last_run_at?: string;
  next_run_at?: string;
}
