import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { logout } from "../services/owner-auth.server";

export const loader = () => redirect("/owner");
export const action = ({ request }: ActionFunctionArgs) => logout(request);
