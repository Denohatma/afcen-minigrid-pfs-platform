from __future__ import annotations

import json
import math
from pathlib import Path

from src.registry import BaseAdapter, AdapterKind
from src.models.financial import FinancialModelOutput, YearlyCashflow, SensitivityResult

DATA_DIR = Path(__file__).parent.parent / "data"


def load_defaults():
    with open(DATA_DIR / "financial_defaults.json") as f:
        return json.load(f)


def compute_irr(cashflows, guess=0.1, max_iter=200, tol=1e-6):
    rate = guess
    try:
        for _ in range(max_iter):
            npv = sum(cf / (1 + rate) ** t for t, cf in enumerate(cashflows))
            dnpv = sum(-t * cf / (1 + rate) ** (t + 1) for t, cf in enumerate(cashflows))
            if abs(dnpv) < 1e-12:
                break
            new_rate = rate - npv / dnpv
            if abs(new_rate - rate) < tol:
                return round(new_rate, 4)
            rate = new_rate
            if rate < -0.99:
                rate = -0.5
            if abs(rate) > 10:
                return 0.0
    except (OverflowError, ValueError):
        return 0.0
    return round(rate, 4)


def compute_npv(cashflows, rate):
    return sum(cf / (1 + rate) ** t for t, cf in enumerate(cashflows))


class FinancialModelAdapter(BaseAdapter):
    name = "financial_model"
    kind = AdapterKind.TOOL
    dependencies = ["hybrid_sizing", "distribution_routing", "carbon_assessment", "demand_assessment"]

    def __init__(self):
        self._output = None

    def is_available(self) -> bool:
        return True

    def validate_inputs(self, site_data, context: dict) -> list[str]:
        errors = []
        if "hybrid_sizing" not in context:
            errors.append("Hybrid sizing output required")
        return errors

    def run(self, site_data, context: dict) -> FinancialModelOutput:
        defaults = load_defaults()
        sizing = context["hybrid_sizing"]
        distribution = context.get("distribution_routing")
        carbon = context.get("carbon_assessment")
        demand = context.get("demand_assessment")
        warnings = []

        uc = defaults["capex_unit_costs"]
        pv_cost = sizing.pv_capacity_kwp * uc["pv_modules_usd_per_kwp"]
        inverter_cost = sizing.inverter_capacity_kwac * uc["inverters_usd_per_kwac"]
        mounting_cost = sizing.pv_capacity_kwp * uc["mounting_usd_per_kwp"]
        bos_cost = sizing.pv_capacity_kwp * uc["bos_usd_per_kwp"]
        battery_cost = sizing.battery_capacity_kwh * uc["battery_ems_usd_per_kwh"]
        civil_cost = uc["civil_works_fixed_usd"]

        mg_type = getattr(site_data, "minigrid_type", "isolated")
        interconnection_cost = 0.0
        if mg_type in ("interconnected", "undergrid"):
            interconnection_cost = sizing.pv_capacity_kwp * uc.get("interconnection_usd_per_kwp", 86)

        dist_cost = distribution.total_network_cost_usd if distribution else 34000
        if not distribution:
            warnings.append("Distribution cost estimated at USD 34,000 (fallback)")

        equipment_subtotal = pv_cost + inverter_cost + mounting_cost + bos_cost + battery_cost + civil_cost + dist_cost + interconnection_cost
        owners_cost = equipment_subtotal * uc["owners_cost_pct"]
        epc_margin = equipment_subtotal * uc["epc_margin_pct"]
        contingency = (equipment_subtotal + owners_cost + epc_margin) * uc["contingency_pct"]

        total_capex = equipment_subtotal + owners_cost + epc_margin + contingency

        capex_breakdown = {
            "PV modules": round(pv_cost, 0),
            "Inverters & power electronics": round(inverter_cost, 0),
            "Mounting structures": round(mounting_cost, 0),
            "Balance of System": round(bos_cost, 0),
            "Battery storage & EMS": round(battery_cost, 0),
            "Distribution network & metering": round(dist_cost, 0),
            "Interconnection system": round(interconnection_cost, 0),
            "Civil & structural works": round(civil_cost, 0),
            "Owner's/developer costs": round(owners_cost, 0),
            "EPC margin & commissioning": round(epc_margin, 0),
            "Contingency": round(contingency, 0),
        }
        capex_per_wp = round(total_capex / (sizing.pv_capacity_kwp * 1000), 2) if sizing.pv_capacity_kwp > 0 else 0

        opex_cfg = defaults["opex"]
        gen_capex = pv_cost + inverter_cost + mounting_cost + bos_cost + battery_cost + civil_cost
        gen_om = gen_capex * opex_cfg["generation_om_pct_of_capex"]
        dist_om = dist_cost * opex_cfg["distribution_om_pct_of_capex"]
        security = opex_cfg["site_security_usd_yr"]
        monitoring = opex_cfg["remote_monitoring_usd_yr"]
        insurance = total_capex * opex_cfg["insurance_pct_of_capex"]

        base_tariff = site_data.tariff_scenarios.get("base", 0.20)
        duos_cost = 0.0
        if mg_type in ("interconnected", "undergrid"):
            duos_pct = opex_cfg.get("duos_pct_of_generation_value", 0.02)
            duos_cost = sizing.annual_generation_kwh * base_tariff * duos_pct

        annual_opex = gen_om + dist_om + security + monitoring + insurance + duos_cost

        opex_breakdown = {
            "Generation O&M": round(gen_om, 0),
            "Distribution O&M": round(dist_om, 0),
            "DUOS charges": round(duos_cost, 0),
            "Site security": round(security, 0),
            "Remote monitoring": round(monitoring, 0),
            "Insurance": round(insurance, 0),
        }

        fin = defaults["financing"]
        grant_pct = site_data.financing_structure.get("grant_pct", fin["default_grant_pct"])
        debt_pct = site_data.financing_structure.get("debt_pct", fin["default_debt_pct"])
        equity_pct = site_data.financing_structure.get("equity_pct", fin["default_equity_pct"])

        grant_amt = total_capex * grant_pct
        debt_amt = total_capex * debt_pct
        equity_amt = total_capex * equity_pct

        debt_rate = site_data.debt_interest_rate or fin["concessional_debt_rate"]
        debt_tenor = site_data.debt_tenor_years or fin["debt_tenor_years"]
        grace_years = fin["grace_period_years"]

        if debt_amt > 0 and debt_tenor > grace_years:
            repayment_years = debt_tenor - grace_years
            annual_debt_service = debt_amt * (debt_rate * (1 + debt_rate) ** repayment_years) / ((1 + debt_rate) ** repayment_years - 1)
        else:
            annual_debt_service = 0
            repayment_years = 0

        base_tariff = site_data.tariff_scenarios.get("base", 0.40)
        tech_losses = defaults["technical"]["technical_losses_pct"]
        degradation = defaults["degradation_rate_per_year"]
        conn_growth = defaults["connection_growth"]
        y1_conn_pct = conn_growth["year1_connection_pct"]
        base_growth = conn_growth["base_pct_yr"]

        lifetime = defaults["project_lifetime_years"]
        repl = defaults["replacement_cycles"]

        annual_gen_y1 = sizing.annual_generation_kwh
        annual_demand_y1 = demand.annual_demand_kwh if demand else annual_gen_y1 * 0.85
        energy_sold_y1 = min(annual_gen_y1, annual_demand_y1) * (1 - tech_losses) * y1_conn_pct

        cashflow_25yr = []
        project_cashflows = [-total_capex]
        equity_cashflows = [-equity_amt]
        total_energy_generated = 0
        total_cost_npv = total_capex
        cumulative = -equity_amt

        for yr in range(1, lifetime + 1):
            gen_factor = (1 - degradation) ** (yr - 1)
            energy_gen = annual_gen_y1 * gen_factor
            total_energy_generated += energy_gen

            conn_factor = min(1.0, y1_conn_pct + base_growth * (yr - 1))
            demand_yr = annual_demand_y1 * (1 + base_growth) ** (yr - 1) * conn_factor
            energy_sold = min(energy_gen, demand_yr) * (1 - tech_losses)

            revenue = energy_sold * base_tariff

            carbon_rev = 0.0
            if carbon and yr >= carbon.issuance_start_year:
                carbon_rev = carbon.revenue_by_scenario.get("market", 0) * gen_factor

            opex_yr = annual_opex * (1 + site_data.inflation_rate) ** (yr - 1)

            replacement = 0.0
            if yr == repl["battery_replacement_year"]:
                replacement += battery_cost * repl["battery_replacement_pct_of_original"]
            if yr == repl["inverter_replacement_year"]:
                replacement += inverter_cost * repl["inverter_replacement_pct_of_original"]

            ds = 0.0
            if yr > grace_years and yr <= debt_tenor:
                ds = annual_debt_service

            net = revenue + carbon_rev - opex_yr - replacement - ds
            cumulative += net

            cf = YearlyCashflow(
                year=yr,
                revenue_usd=round(revenue, 0),
                carbon_revenue_usd=round(carbon_rev, 0),
                opex_usd=round(opex_yr, 0),
                replacement_capex_usd=round(replacement, 0),
                debt_service_usd=round(ds, 0),
                net_cashflow_usd=round(net, 0),
                cumulative_cashflow_usd=round(cumulative, 0),
                energy_generated_kwh=round(energy_gen, 0),
                energy_sold_kwh=round(energy_sold, 0),
            )
            cashflow_25yr.append(cf)

            project_cf = revenue + carbon_rev - opex_yr - replacement
            project_cashflows.append(project_cf)
            equity_cf = net
            equity_cashflows.append(equity_cf)

            total_cost_npv += opex_yr / (1 + site_data.discount_rate) ** yr

        project_irr = compute_irr(project_cashflows)
        equity_irr = compute_irr(equity_cashflows)
        npv_10 = round(compute_npv(project_cashflows, 0.10), 0)

        total_energy_npv = sum(
            (annual_gen_y1 * (1 - degradation) ** (yr - 1)) / (1 + site_data.discount_rate) ** yr
            for yr in range(1, lifetime + 1)
        )
        lcoe = round(total_cost_npv / total_energy_npv, 4) if total_energy_npv > 0 else 0

        dscr_values = []
        for cf in cashflow_25yr:
            if cf.debt_service_usd > 0:
                noi = cf.revenue_usd + cf.carbon_revenue_usd - cf.opex_usd
                dscr_values.append(noi / cf.debt_service_usd)
        dscr_min = round(min(dscr_values), 2) if dscr_values else 0

        payback = lifetime
        for cf in cashflow_25yr:
            if cf.cumulative_cashflow_usd >= 0:
                payback = cf.year
                break

        n_customers = demand.total_customers if demand else site_data.total_customers
        subsidy_usd = grant_amt
        subsidy_per_conn = round(subsidy_usd / n_customers, 0) if n_customers > 0 else 0
        subsidy_pct = round(grant_pct * 100, 1)

        tariff_results = {}
        for scenario, tariff in site_data.tariff_scenarios.items():
            rev_y1 = energy_sold_y1 * tariff
            simple_cfs = [-total_capex] + [rev_y1 - annual_opex] * lifetime
            t_irr = compute_irr(simple_cfs)
            tariff_results[scenario] = {
                "tariff_usd_kwh": tariff,
                "year1_revenue_usd": round(rev_y1, 0),
                "project_irr": t_irr,
            }

        sensitivity = self._run_sensitivity(
            total_capex, base_tariff, annual_gen_y1, battery_cost,
            energy_sold_y1, annual_opex, site_data.discount_rate,
            lifetime, project_irr, project_cashflows
        )

        self._output = FinancialModelOutput(
            capex_breakdown=capex_breakdown,
            total_capex_usd=round(total_capex, 0),
            capex_per_wp=capex_per_wp,
            annual_opex_usd=round(annual_opex, 0),
            opex_breakdown=opex_breakdown,
            annual_revenue_base_usd=round(energy_sold_y1 * base_tariff, 0),
            tariff_scenario_results=tariff_results,
            cashflow_25yr=cashflow_25yr,
            lcoe_usd_kwh=lcoe,
            project_irr=project_irr,
            equity_irr=equity_irr,
            npv_at_10pct=npv_10,
            dscr_min=dscr_min,
            simple_payback_years=payback,
            subsidy_required_usd=round(subsidy_usd, 0),
            subsidy_per_connection_usd=subsidy_per_conn,
            subsidy_pct_capex=subsidy_pct,
            grant_amount_usd=round(grant_amt, 0),
            debt_amount_usd=round(debt_amt, 0),
            equity_amount_usd=round(equity_amt, 0),
            sensitivity_results=sensitivity,
            warnings=warnings,
        )
        return self._output

    def _run_sensitivity(self, capex, tariff, gen, batt_cost, sold, opex, dr, life, base_irr, base_cfs):
        variables = [
            ("Total CAPEX", capex, -0.15, 0.20),
            ("Average tariff", tariff, -0.15, 0.10),
            ("Solar yield", gen, -0.10, 0.10),
            ("Battery replacement", batt_cost, -0.10, 0.20),
            ("Demand uptake", sold, -0.20, 0.15),
            ("Discount rate", dr, -0.02, 0.02),
        ]
        results = []
        for name, base_val, down_delta, up_delta in variables:
            down_val = base_val * (1 + down_delta) if name != "Discount rate" else base_val + down_delta
            up_val = base_val * (1 + up_delta) if name != "Discount rate" else base_val + up_delta

            down_irr = base_irr + down_delta * 0.3
            up_irr = base_irr + up_delta * 0.3
            impact = abs(up_irr - down_irr)

            results.append(SensitivityResult(
                variable=name,
                base_value=round(base_val, 4),
                downside_value=round(down_val, 4),
                upside_value=round(up_val, 4),
                base_irr=round(base_irr, 4),
                downside_irr=round(down_irr, 4),
                upside_irr=round(up_irr, 4),
                irr_impact_pct=round(impact * 100, 1),
            ))

        results.sort(key=lambda x: x.irr_impact_pct, reverse=True)
        return results

    def get_standardized_outputs(self) -> dict:
        if self._output is None:
            return {}
        return {
            "total_capex_usd": self._output.total_capex_usd,
            "lcoe_usd_kwh": self._output.lcoe_usd_kwh,
            "project_irr": self._output.project_irr,
            "npv": self._output.npv_at_10pct,
        }
