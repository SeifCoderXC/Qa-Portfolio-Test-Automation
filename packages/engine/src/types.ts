export type Field = {
  name: string;
  type: string;
  label: string;
  selector: string;
  required: boolean;
};

export type AppPage = {
  url: string;
  title: string;
  /** Visible h1/h2 text, useful for checkable expectations. */
  headings: string[];
  forms: { selector: string; fields: Field[] }[];
  buttons: { text: string; selector: string }[];
  /** Inputs that are not inside a <form>. */
  inputs: Field[];
  /** Same-origin links found on the page (absolute, no hash). */
  links: { text: string; url: string }[];
};

export type AppMap = {
  baseUrl: string;
  pages: AppPage[];
  auth: { loginDetected: boolean; loginUrl?: string; loggedIn?: boolean };
};

export type Credentials = { email: string; password: string };

export type Severity = "low" | "medium" | "high" | "critical";

export type PlannedCase = {
  key: string;
  title: string;
  objective: string;
  preconditions: string;
  steps: string[];
  expected: string;
  severity: Severity;
};
