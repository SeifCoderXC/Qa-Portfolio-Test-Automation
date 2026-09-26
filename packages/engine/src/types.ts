export type Field = {
  name: string;
  type: string;
  /** Real accessible label (<label>, aria-labelledby, aria-label, title). Empty if none. */
  label: string;
  placeholder: string;
  labelSource: "label" | "aria-labelledby" | "aria-label" | "title" | "placeholder-only" | "none";
  autocomplete: string;
  selector: string;
  required: boolean;
};

/** Text a test can use to find the field: its label, else placeholder, else name. */
export const fieldHandle = (f: Pick<Field, "label" | "placeholder" | "name">) =>
  f.label || f.placeholder || f.name;

export type AppPage = {
  url: string;
  title: string;
  /** Visible h1/h2 text, useful for checkable expectations. */
  headings: string[];
  /** `submit` is the text of the form's own submit button, if any. */
  forms: { selector: string; fields: Field[]; submit?: string }[];
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
