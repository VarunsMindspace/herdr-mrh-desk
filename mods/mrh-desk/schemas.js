// The document families. Fields are data: edit labels, keys, defaults and
// validation here. The desk and the preview read the same objects.

export const MODES = [
  { id: "deed", label: "Deed", title: "Partnership Deed" },
  { id: "projection", label: "Projection", title: "Projected Financials" },
  { id: "provision", label: "Provision", title: "Tax Provision" },
];

const partner = () => ({ name: "", pan: "", capital: "", share: "" });

export const SCHEMAS = {
  deed: {
    id: "deed",
    title: "Partnership Deed",
    short: "Deed",
    steps: [
      {
        id: "parties",
        label: "Parties",
        fields: [
          { key: "firm", label: "Firm name", type: "text", required: true, placeholder: "M/s ..." },
          { key: "place", label: "Place of execution", type: "text", required: true, placeholder: "e.g. Bengaluru" },
          { key: "execution_date", label: "Date", type: "date", required: true, placeholder: "YYYY-MM-DD" },
          {
            key: "partners",
            label: "Partners",
            type: "list",
            min: 2,
            itemLabel: "Partner",
            add: "Add partner",
            sum: "share",
            sumEquals: 100,
            item: [
              { key: "name", label: "Name", type: "text", required: true },
              { key: "pan", label: "PAN", type: "text", pattern: "^[A-Z]{5}[0-9]{4}[A-Z]$", placeholder: "ABCDE1234F" },
              { key: "capital", label: "Capital", type: "money", required: true },
              { key: "share", label: "Profit share %", type: "percent", required: true },
            ],
          },
        ],
      },
      {
        id: "terms",
        label: "Terms",
        fields: [
          { key: "business", label: "Business", type: "textarea", required: true, rows: 3, placeholder: "The business of the firm shall be ..." },
          { key: "duration", label: "Duration", type: "text", placeholder: "At will" },
          { key: "bank", label: "Bank", type: "text", placeholder: "Bank and branch" },
          { key: "interest", label: "Interest on capital", type: "text", placeholder: "12% p.a." },
        ],
      },
      {
        id: "clauses",
        label: "Clauses",
        fields: [
          {
            key: "clauses",
            label: "Clauses",
            type: "list",
            min: 1,
            itemLabel: "Clause",
            add: "Add clause",
            item: [{ key: "text", label: "Clause", type: "textarea", required: true, rows: 3 }],
          },
        ],
      },
      { id: "review", label: "Review", fields: [] },
    ],
    defaults: {
      firm: "",
      place: "",
      execution_date: "",
      partners: [partner(), partner()],
      business: "",
      duration: "At will",
      bank: "",
      interest: "12% p.a.",
      clauses: [
        { text: "The business of the firm shall be carried on under the name and style of the firm." },
        { text: "The profit and loss of the firm shall be shared by the partners in the proportion set out in this deed." },
        { text: "The books of account shall be kept at the firm's place of business and shall be open to inspection by the partners." },
      ],
    },
  },

  projection: {
    id: "projection",
    title: "Projected Financials",
    short: "Projection",
    steps: [
      {
        id: "inputs",
        label: "Inputs",
        fields: [
          { key: "client", label: "Client", type: "text", required: true, placeholder: "Client name" },
          { key: "fy", label: "First year", type: "text", required: true, placeholder: "2026-27" },
          { key: "years", label: "Years", type: "number", min: 1, max: 10, placeholder: "5" },
          { key: "base_revenue", label: "Base revenue", type: "money", required: true, placeholder: "10000000" },
          { key: "growth", label: "Revenue growth %", type: "percent", placeholder: "12" },
          { key: "ebitda_margin", label: "EBITDA margin %", type: "percent", placeholder: "18" },
        ],
      },
      {
        id: "assumptions",
        label: "Assumptions",
        fields: [
          { key: "tax_rate", label: "Tax rate %", type: "percent", placeholder: "25.17" },
          { key: "capex_pct", label: "Capex % of revenue", type: "percent", placeholder: "4" },
          { key: "depreciation_pct", label: "Depreciation % of revenue", type: "percent", placeholder: "5" },
          { key: "wc_days", label: "Working capital days", type: "number", min: 0, max: 365, placeholder: "45" },
          { key: "interest_rate", label: "Interest rate %", type: "percent", placeholder: "10" },
          { key: "debt", label: "Opening debt", type: "money", placeholder: "0" },
        ],
      },
      { id: "review", label: "Review", fields: [] },
    ],
    defaults: {
      client: "",
      fy: "2026-27",
      years: "5",
      base_revenue: "",
      growth: "12",
      ebitda_margin: "18",
      tax_rate: "25.17",
      capex_pct: "4",
      depreciation_pct: "5",
      wc_days: "45",
      interest_rate: "10",
      debt: "0",
    },
  },

  provision: {
    id: "provision",
    title: "Tax Provision",
    short: "Provision",
    steps: [
      {
        id: "inputs",
        label: "Inputs",
        fields: [
          { key: "entity", label: "Entity", type: "text", required: true, placeholder: "Client / entity" },
          { key: "fy", label: "Financial year", type: "text", required: true, placeholder: "2026-27" },
          { key: "book_profit", label: "Book profit", type: "money", required: true, placeholder: "10000000" },
          { key: "disallowed", label: "Disallowed expenses", type: "money", placeholder: "0" },
          { key: "dep_book", label: "Depreciation (books)", type: "money", placeholder: "0" },
          { key: "dep_tax", label: "Depreciation (income tax)", type: "money", placeholder: "0" },
        ],
      },
      {
        id: "computation",
        label: "Computation",
        fields: [
          { key: "tax_rate", label: "Tax rate %", type: "percent", placeholder: "25.17" },
          { key: "surcharge", label: "Surcharge %", type: "percent", placeholder: "7" },
          { key: "cess", label: "Cess %", type: "percent", placeholder: "4" },
          { key: "mat_credit", label: "MAT credit", type: "money", placeholder: "0" },
          { key: "advance_tax", label: "Advance tax", type: "money", placeholder: "0" },
          { key: "tds", label: "TDS", type: "money", placeholder: "0" },
        ],
      },
      { id: "review", label: "Review", fields: [] },
    ],
    defaults: {
      entity: "",
      fy: "2026-27",
      book_profit: "",
      disallowed: "0",
      dep_book: "0",
      dep_tax: "0",
      tax_rate: "25.17",
      surcharge: "7",
      cess: "4",
      mat_credit: "0",
      advance_tax: "0",
      tds: "0",
    },
  },
};
