import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { hasAdminArea } from "../auth/admin-access";

@Injectable()
export class CommercialAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) throw new ForbiddenException("Acesso restrito à equipe de administração.");
    const route = request.path.replace(/^\/api\/commercial/, "");
    const area = /\/admin\/(invoices|finance|billing\/|audit)/.test(route) || route === "/billing/config" ? "FINANCE" : route.startsWith("/admin/team") ? "TEAM" : route.startsWith("/admin/settings") || route.startsWith("/admin/packages") && request.method !== "GET" ? "SETTINGS" : route.startsWith("/admin/cases") ? "SUPPORT" : route.startsWith("/admin/users") ? "ACCOUNTS" : route.startsWith("/admin/analytics") || route.startsWith("/admin/overview") || route.startsWith("/admin/operations-audit") ? "ANALYTICS" : "COMMERCIAL";
    const readOnlyPartnerList = route === "/admin/partners" && request.method === "GET" && hasAdminArea(request.user.adminRole, "FINANCE");
    const allowed = hasAdminArea(request.user.adminRole, area) || readOnlyPartnerList || route.startsWith("/admin/documents") && (hasAdminArea(request.user.adminRole, "FINANCE") || hasAdminArea(request.user.adminRole, "COMMERCIAL"));
    if (!allowed) throw new ForbiddenException("Sua função não permite esta operação administrativa.");
    return true;
  }
}
