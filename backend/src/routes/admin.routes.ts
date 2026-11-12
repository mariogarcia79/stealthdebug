import { Router } from "express";
import { asyncHandler } from "../middleware/error.middleware";
import { authenticate, checkRole } from "../middleware/auth.middleware";
import { requireCsrf } from "../middleware/csrf.middleware";
import AdminController from "../controllers/admin.controller";

// /api/admin: agents, their change requests, guidelines, audit log.
// Admin session + CSRF token (X-CSRF-Token) on every change.
const router = Router();
router.use(authenticate, checkRole("admin"), requireCsrf);

router.get(   "/csrf",                              AdminController.csrf);
router.get(   "/change-requests",                   asyncHandler(AdminController.listChangeRequests));
router.get(   "/change-requests/:id",               asyncHandler(AdminController.getChangeRequest));
router.post(  "/change-requests/:id/accept",        asyncHandler(AdminController.accept));
router.post(  "/change-requests/:id/decline",       asyncHandler(AdminController.decline));
router.get(   "/agents",                            asyncHandler(AdminController.listAgents));
router.post(  "/agents",                            asyncHandler(AdminController.registerAgent));
router.post(  "/agents/:id/revoke",                 asyncHandler(AdminController.revokeAgentTokens));
router.delete("/agents/:id",                        asyncHandler(AdminController.removeAgent));
router.get(   "/guidelines",                        asyncHandler(AdminController.getGuidelines));
router.get(   "/guidelines/:version",               asyncHandler(AdminController.getGuidelinesVersion));
router.put(   "/guidelines",                        asyncHandler(AdminController.saveGuidelines));
router.get(   "/audit",                             asyncHandler(AdminController.auditLog));

export default router;
