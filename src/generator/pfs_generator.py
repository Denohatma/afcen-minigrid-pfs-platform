import logging
from datetime import date
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

logger = logging.getLogger("minigrid")

TEMPLATE_DIR = Path(__file__).parent / "templates"

SECTIONS = [
    "01_executive_summary",
    "02_introduction",
    "03_site_overview",
    "04_demand_assessment",
    "04b_value_chain_pue",
    "05_solar_resource",
    "06_load_demand_balance",
    "07_generation_design",
    "08_distribution_design",
    "09_environmental_social",
    "10_financial_model",
    "11_carbon_assessment",
    "12_regulatory_grid_arrival",
    "13_risk_register",
    "14_implementation_timeline",
    "15_recommendation",
    "16_annexes",
]


def _fmt_usd(value):
    try:
        v = float(value)
        if abs(v) >= 1_000_000:
            return f"${v:,.0f}"
        if abs(v) >= 1000:
            return f"${v:,.0f}"
        return f"${v:,.2f}"
    except (TypeError, ValueError):
        return str(value)


def _fmt_pct(value, decimals=1):
    try:
        return f"{float(value):.{decimals}f}%"
    except (TypeError, ValueError):
        return str(value)


def _fmt_num(value, decimals=0):
    try:
        v = float(value)
        if decimals == 0:
            return f"{v:,.0f}"
        return f"{v:,.{decimals}f}"
    except (TypeError, ValueError):
        return str(value)


class PFSGenerator:
    def __init__(self):
        self.env = Environment(
            loader=FileSystemLoader(str(TEMPLATE_DIR)),
            autoescape=select_autoescape([]),
            trim_blocks=True,
            lstrip_blocks=True,
        )
        self.env.filters["usd"] = _fmt_usd
        self.env.filters["pct"] = _fmt_pct
        self.env.filters["num"] = _fmt_num

    def generate(self, site_data, ctx, output_dir: str):
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        chart_paths = {}
        try:
            from src.generator.chart_generator import generate_all_charts
            chart_paths = generate_all_charts(site_data, ctx, output_dir)
        except Exception as e:
            logger.warning(f"Chart generation failed: {e}")

        template_ctx = self._build_context(site_data, ctx)
        template_ctx["charts"] = chart_paths
        rendered_sections = []

        for section_name in SECTIONS:
            template_file = f"{section_name}.md.j2"
            try:
                template = self.env.get_template(template_file)
                rendered = template.render(**template_ctx)
                rendered_sections.append(rendered)
                logger.debug(f"Rendered section: {section_name}")
            except Exception as e:
                logger.warning(f"Failed to render {section_name}: {e}")
                rendered_sections.append(
                    f"\n## {section_name.replace('_', ' ').title()}\n\n"
                    f"[DATA GAP: Template rendering failed. Error: {e}]\n"
                )

        full_document = "\n\n---\n\n".join(rendered_sections)

        md_path = output_path / f"{site_data.site_name.lower().replace(' ', '_')}_pfs_v3.md"
        md_path.write_text(full_document, encoding="utf-8")
        logger.info(f"Markdown PFS written to {md_path}")

        try:
            from src.generator.docx_writer import write_docx
            docx_path = output_path / f"{site_data.site_name.lower().replace(' ', '_')}_pfs_v3.docx"
            write_docx(full_document, str(docx_path), site_data, chart_paths)
            logger.info(f"DOCX PFS written to {docx_path}")
        except ImportError:
            logger.warning("python-docx not available. Skipping DOCX generation.")
        except Exception as e:
            logger.warning(f"DOCX generation failed: {e}")

        return str(md_path)

    def _build_context(self, site_data, ctx):
        demand = ctx.outputs.get("demand_assessment")
        solar = ctx.outputs.get("solar_resource")
        sizing = ctx.outputs.get("hybrid_sizing")
        distribution = ctx.outputs.get("distribution_routing")
        carbon = ctx.outputs.get("carbon_assessment")
        financial = ctx.outputs.get("financial_model")
        grid_arrival = ctx.outputs.get("grid_arrival")

        irr = financial.project_irr if financial else None
        subsidy_pct = financial.subsidy_pct_capex if financial else None
        has_critical_gap = bool(ctx.errors)

        if irr is not None and not has_critical_gap:
            if irr >= 0.08 and (subsidy_pct is None or subsidy_pct <= 50):
                recommendation = "Go"
            elif irr >= 0.05:
                recommendation = "Conditional Go"
            elif demand is not None:
                recommendation = "Redesign"
            else:
                recommendation = "No-Go"
        else:
            recommendation = "Conditional Go" if irr is not None else "Insufficient Data"

        all_warnings = []
        for adapter_name, output in ctx.outputs.items():
            if hasattr(output, "warnings"):
                for w in output.warnings:
                    all_warnings.append({"source": adapter_name, "warning": w})

        return {
            "site": site_data,
            "demand": demand,
            "solar": solar,
            "sizing": sizing,
            "distribution": distribution,
            "carbon": carbon,
            "financial": financial,
            "grid_arrival": grid_arrival,
            "recommendation": recommendation,
            "all_warnings": all_warnings,
            "errors": ctx.errors,
            "timings": ctx.timings,
            "generation_date": date.today().isoformat(),
            "platform_version": "1.0.0",
        }
