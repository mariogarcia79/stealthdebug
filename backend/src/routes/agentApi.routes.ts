import { Router } from "express";
import { asyncHandler } from "../middleware/error.middleware";
import { authenticateAgent, requireScope, auditCall } from "../middleware/agentAuth.middleware";
import AgentApiController from "../controllers/agentApi.controller";

// /api/agent: the MCP server's backend (see middleware/agentAuth.middleware.ts).
// No cookie is read here, and no other route accepts these tokens.
const router = Router();
router.use(authenticateAgent);

const read = requireScope("posts:read");
const write = requireScope("changes:write");

router.get( "/posts",                          auditCall("list_posts"),             read,  asyncHandler(AgentApiController.listPosts));
router.get( "/posts/:id",                      auditCall("get_post", "post"),               read,  asyncHandler(AgentApiController.getPost));
router.get( "/guidelines",                     auditCall("read_guidelines"),        read,  asyncHandler(AgentApiController.getGuidelines));
router.get( "/change-requests",                auditCall("list_my_change_requests"), write, asyncHandler(AgentApiController.listChangeRequests));
router.get( "/change-requests/:id",            auditCall("get_change_request", "changeRequest"),     write, asyncHandler(AgentApiController.getChangeRequest));
router.get( "/images",                         auditCall("list_my_images"),         write, asyncHandler(AgentApiController.listImages));
router.post("/images",                         auditCall("upload_image"),           write, asyncHandler(AgentApiController.uploadImage));
router.post("/change-requests",                auditCall("propose"),                write, asyncHandler(AgentApiController.createChangeRequest));
router.post("/change-requests/:id/revisions",  auditCall("update_change_request", "changeRequest"),  write, asyncHandler(AgentApiController.reviseChangeRequest));

export default router;
