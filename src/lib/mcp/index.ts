import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listWorkOrders from "./tools/list-work-orders";
import getWorkOrder from "./tools/get-work-order";
import createWorkOrder from "./tools/create-work-order";
import listProperties from "./tools/list-properties";
import listUnits from "./tools/list-units";
import listTenants from "./tools/list-tenants";
import addJobNote from "./tools/add-job-note";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "herald-property-management",
  title: "Herald Property Management",
  version: "0.1.0",
  instructions:
    "Tools for Herald Property Management. Read and create work orders, browse properties, units, and tenants, and add notes. All access is scoped to the signed-in user via row-level security.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listWorkOrders, getWorkOrder, createWorkOrder, listProperties, listUnits, listTenants, addJobNote],
});
