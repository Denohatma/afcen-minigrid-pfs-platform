import { z } from "zod";

export const customerSegmentSchema = z.object({
  category: z.string().min(1, "Category is required"),
  sub_type: z.string().min(1, "Sub-type is required"),
  count: z.coerce.number().int().min(1, "Must be at least 1"),
  tier: z.string().default("basic"),
  estimated_load_kw: z.coerce.number().positive().nullable().default(null),
  operating_hours: z.string().default(""),
});

export const anchorLoadSchema = z.object({
  load_type: z.string().min(1, "Load type is required"),
  name: z.string().min(1, "Name is required"),
  count: z.coerce.number().int().min(1).default(1),
  estimated_load_kw: z.coerce.number().positive().nullable().default(null),
  operating_hours: z.string().default(""),
  load_shape: z.string().default("institutional"),
});

export const siteDataSchema = z.object({
  // Step 1: Identity
  site_name: z.string().min(1, "Site name is required").max(200),
  district: z.string().default(""),
  province: z.string().default(""),
  country: z.string().default(""),
  coordinates: z.tuple([
    z.coerce.number().min(-90).max(90),
    z.coerce.number().min(-180).max(180),
  ]),
  developer: z.string().default(""),
  disco_name: z.string().default(""),
  minigrid_type: z.enum(["isolated", "undergrid", "interconnected"]).default("isolated"),
  disco_supply_hours: z.coerce.number().min(0).max(24).default(0),

  // Step 2: Settlement
  population: z.coerce.number().int().min(0).default(0),
  mapped_structures: z.coerce.number().int().min(0).default(0),
  settlement_radius_m: z.coerce.number().min(100).max(50000).default(2000),
  terrain: z.enum(["flat", "rolling", "hilly", "mountainous"]).default("rolling"),
  access_description: z.string().default(""),
  economic_activities: z.array(z.string()).default([]),
  social_services: z.array(z.string()).default([]),

  // Step 3: Customers
  customers: z.array(customerSegmentSchema).default([]),

  // Step 4: Anchors
  anchors: z.array(anchorLoadSchema).default([]),

  // Step 5: Grid & E&S
  grid_status: z.enum(["off_grid", "on_grid_expected", "grid_connected"]).default("off_grid"),
  grid_arrival_evidence: z.object({
    grid_extension_planned: z.boolean().default(false),
    timeline_years: z.coerce.number().positive().nullable().default(null),
    funding_committed: z.boolean().default(false),
    funding_source: z.string().default(""),
    contractor_mobilised: z.boolean().default(false),
    disco_track_record: z.enum(["poor", "mixed", "good"]).default("poor"),
    recent_extensions_in_district: z.coerce.number().int().min(0).default(0),
    notes: z.string().default(""),
  }).default(() => ({
    grid_extension_planned: false,
    timeline_years: null,
    funding_committed: false,
    funding_source: "",
    contractor_mobilised: false,
    disco_track_record: "poor" as const,
    recent_extensions_in_district: 0,
    notes: "",
  })),
  protected_area_overlap: z.boolean().default(false),
  flood_risk: z.enum(["low", "moderate", "high"]).default("low"),
  biodiversity_risk: z.enum(["low", "moderate", "high"]).default("low"),
  ifc_category: z.enum(["A", "B", "C"]).default("B"),

  // Step 6: Financial
  tariff_scenarios: z.object({
    low: z.coerce.number().positive().default(0.09),
    base: z.coerce.number().positive().default(0.20),
    high: z.coerce.number().positive().default(0.35),
  }).default(() => ({ low: 0.09, base: 0.20, high: 0.35 })),
  discount_rate: z.coerce.number().gt(0).lt(1).default(0.10),
  inflation_rate: z.coerce.number().min(0).lt(1).default(0.05),
  fx_rate_ngn_usd: z.coerce.number().positive().default(1600.0),
  financing_structure: z.object({
    grant_pct: z.coerce.number().min(0).max(1).default(0.40),
    debt_pct: z.coerce.number().min(0).max(1).default(0.35),
    equity_pct: z.coerce.number().min(0).max(1).default(0.25),
  }).default(() => ({ grant_pct: 0.40, debt_pct: 0.35, equity_pct: 0.25 })),
  debt_interest_rate: z.coerce.number().gt(0).lt(1).default(0.08),
  debt_tenor_years: z.coerce.number().int().positive().default(15),

  // Existing PFS (optional calibration)
  existing_pfs: z.object({
    pv_capacity_kwp: z.coerce.number().positive().nullable().default(null),
    battery_capacity_kwh: z.coerce.number().positive().nullable().default(null),
    inverter_capacity_kwac: z.coerce.number().positive().nullable().default(null),
    total_capex_usd: z.coerce.number().positive().nullable().default(null),
    lcoe_usd_kwh: z.coerce.number().positive().nullable().default(null),
    tariff_usd_kwh: z.coerce.number().positive().nullable().default(null),
    annual_generation_mwh: z.coerce.number().positive().nullable().default(null),
    distribution_length_km: z.coerce.number().positive().nullable().default(null),
    customer_count: z.coerce.number().int().positive().nullable().default(null),
  }).default(() => ({
    pv_capacity_kwp: null,
    battery_capacity_kwh: null,
    inverter_capacity_kwac: null,
    total_capex_usd: null,
    lcoe_usd_kwh: null,
    tariff_usd_kwh: null,
    annual_generation_mwh: null,
    distribution_length_km: null,
    customer_count: null,
  })),
});

export type SiteFormData = z.infer<typeof siteDataSchema>;

// Per-step validation schemas
export const stepSchemas = [
  // Step 1: Identity
  siteDataSchema.pick({
    site_name: true,
    district: true,
    province: true,
    country: true,
    coordinates: true,
    developer: true,
    disco_name: true,
    minigrid_type: true,
  }),
  // Step 2: Settlement
  siteDataSchema.pick({
    population: true,
    mapped_structures: true,
    settlement_radius_m: true,
    terrain: true,
    access_description: true,
    economic_activities: true,
    social_services: true,
  }),
  // Step 3: Customers
  siteDataSchema.pick({ customers: true }),
  // Step 4: Anchors
  siteDataSchema.pick({ anchors: true }),
  // Step 5: Grid & E&S
  siteDataSchema.pick({
    grid_status: true,
    grid_arrival_evidence: true,
    disco_supply_hours: true,
    protected_area_overlap: true,
    flood_risk: true,
    biodiversity_risk: true,
    ifc_category: true,
  }),
  // Step 6: Financial
  siteDataSchema.pick({
    tariff_scenarios: true,
    discount_rate: true,
    inflation_rate: true,
    fx_rate_ngn_usd: true,
    financing_structure: true,
    debt_interest_rate: true,
    debt_tenor_years: true,
  }),
  // Step 7: Review (no additional validation)
  z.object({}),
] as const;

export const STEP_LABELS = [
  "Site Identity",
  "Settlement",
  "Customers",
  "Anchor Loads",
  "Grid & E&S",
  "Financial",
  "Review & Run",
];

export const DEFAULT_SITE_DATA: SiteFormData = {
  site_name: "",
  district: "",
  province: "",
  country: "",
  coordinates: [0, 0],
  developer: "",
  disco_name: "",
  minigrid_type: "isolated",
  disco_supply_hours: 0,
  population: 0,
  mapped_structures: 0,
  settlement_radius_m: 2000,
  terrain: "rolling",
  access_description: "",
  economic_activities: [],
  social_services: [],
  customers: [],
  anchors: [],
  grid_status: "off_grid",
  grid_arrival_evidence: {
    grid_extension_planned: false,
    timeline_years: null,
    funding_committed: false,
    funding_source: "",
    contractor_mobilised: false,
    disco_track_record: "poor",
    recent_extensions_in_district: 0,
    notes: "",
  },
  protected_area_overlap: false,
  flood_risk: "low",
  biodiversity_risk: "low",
  ifc_category: "B",
  tariff_scenarios: { low: 0.09, base: 0.20, high: 0.35 },
  discount_rate: 0.10,
  inflation_rate: 0.05,
  fx_rate_ngn_usd: 1600.0,
  financing_structure: { grant_pct: 0.40, debt_pct: 0.35, equity_pct: 0.25 },
  debt_interest_rate: 0.08,
  debt_tenor_years: 15,
  existing_pfs: {
    pv_capacity_kwp: null,
    battery_capacity_kwh: null,
    inverter_capacity_kwac: null,
    total_capex_usd: null,
    lcoe_usd_kwh: null,
    tariff_usd_kwh: null,
    annual_generation_mwh: null,
    distribution_length_km: null,
    customer_count: null,
  },
};
