import json
import logging
import time
from pathlib import Path

from src.models.site import SiteData
from src.registry import AdapterRegistry

logger = logging.getLogger("minigrid")


class PipelineContext:
    def __init__(self, site_data: SiteData):
        self.site_data = site_data
        self.outputs: dict = {}
        self.errors: dict = {}
        self.timings: dict = {}

    def set_output(self, adapter_name: str, output):
        self.outputs[adapter_name] = output

    def get_output(self, adapter_name: str):
        return self.outputs.get(adapter_name)

    def set_error(self, adapter_name: str, error: str):
        self.errors[adapter_name] = error

    def has_output(self, adapter_name: str) -> bool:
        return adapter_name in self.outputs

    def has_error(self, adapter_name: str) -> bool:
        return adapter_name in self.errors


class Orchestrator:
    def __init__(self, registry: AdapterRegistry):
        self.registry = registry

    def run(self, site_data: SiteData, output_dir: str = "output") -> PipelineContext:
        ctx = PipelineContext(site_data)
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        execution_order = self.registry.resolve_execution_order()
        logger.info(f"Execution order: {execution_order}")
        logger.info(f"Site: {site_data.site_name} ({site_data.lat}, {site_data.lon})")
        logger.info(f"Total customers: {site_data.total_customers}")

        for adapter_name in execution_order:
            adapter = self.registry.get(adapter_name)
            if adapter is None:
                continue

            if not adapter.is_available():
                logger.warning(f"[{adapter_name}] Not available, skipping")
                ctx.set_error(adapter_name, "Adapter not available")
                continue

            deps_met = True
            for dep in adapter.dependencies:
                if ctx.has_error(dep) and not ctx.has_output(dep):
                    logger.warning(f"[{adapter_name}] Dependency '{dep}' failed, skipping")
                    ctx.set_error(adapter_name, f"Dependency '{dep}' failed")
                    deps_met = False
                    break

            if not deps_met:
                continue

            validation_errors = adapter.validate_inputs(site_data, ctx.outputs)
            if validation_errors:
                logger.warning(f"[{adapter_name}] Validation errors: {validation_errors}")
                ctx.set_error(adapter_name, f"Validation: {'; '.join(validation_errors)}")
                continue

            logger.info(f"[{adapter_name}] Running...")
            start = time.time()
            try:
                output = adapter.run(site_data, ctx.outputs)
                elapsed = time.time() - start
                ctx.set_output(adapter_name, output)
                ctx.timings[adapter_name] = elapsed
                logger.info(f"[{adapter_name}] Complete ({elapsed:.1f}s)")
            except Exception as e:
                elapsed = time.time() - start
                ctx.timings[adapter_name] = elapsed
                logger.error(f"[{adapter_name}] Failed ({elapsed:.1f}s): {e}")
                ctx.set_error(adapter_name, str(e))

        logger.info("--- Pipeline Summary ---")
        for name in execution_order:
            if ctx.has_output(name):
                logger.info(f"  {name}: OK ({ctx.timings.get(name, 0):.1f}s)")
            elif ctx.has_error(name):
                logger.info(f"  {name}: FAILED - {ctx.errors[name]}")
            else:
                logger.info(f"  {name}: SKIPPED")

        return ctx
