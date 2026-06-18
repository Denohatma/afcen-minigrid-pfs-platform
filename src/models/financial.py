from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class YearlyCashflow:
    year: int
    revenue_usd: float = 0.0
    carbon_revenue_usd: float = 0.0
    opex_usd: float = 0.0
    replacement_capex_usd: float = 0.0
    debt_service_usd: float = 0.0
    net_cashflow_usd: float = 0.0
    cumulative_cashflow_usd: float = 0.0
    energy_generated_kwh: float = 0.0
    energy_sold_kwh: float = 0.0


@dataclass
class SensitivityResult:
    variable: str
    base_value: float
    downside_value: float
    upside_value: float
    base_irr: float
    downside_irr: float
    upside_irr: float
    irr_impact_pct: float  # max swing from base


@dataclass
class FinancialModelOutput:
    # CAPEX
    capex_breakdown: dict = field(default_factory=dict)  # component -> USD
    total_capex_usd: float = 0.0
    capex_per_wp: float = 0.0

    # OPEX
    annual_opex_usd: float = 0.0
    opex_breakdown: dict = field(default_factory=dict)

    # Revenue
    annual_revenue_base_usd: float = 0.0
    tariff_scenario_results: dict = field(default_factory=dict)

    # Cashflow
    cashflow_25yr: list[YearlyCashflow] = field(default_factory=list)

    # Metrics
    lcoe_usd_kwh: float = 0.0
    project_irr: float = 0.0
    equity_irr: float = 0.0
    npv_at_10pct: float = 0.0
    dscr_min: float = 0.0
    simple_payback_years: float = 0.0

    # Subsidy
    subsidy_required_usd: float = 0.0
    subsidy_per_connection_usd: float = 0.0
    subsidy_pct_capex: float = 0.0

    # Financing
    grant_amount_usd: float = 0.0
    debt_amount_usd: float = 0.0
    equity_amount_usd: float = 0.0

    # Sensitivity
    sensitivity_results: list[SensitivityResult] = field(default_factory=list)

    warnings: list[str] = field(default_factory=list)
