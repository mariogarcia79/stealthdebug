import { Router } from "express";
import { asyncHandler } from "../middleware/error.middleware";
import { authenticate, optionalAuth, validateCommentOwner } from "../middleware/auth.middleware";
import CommentController from "../controllers/comments.controller";

const router = Router();

router.get(   "/:postId",     optionalAuth, asyncHandler(CommentController.getAllComments));
router.get(   "/:postId/:id", asyncHandler(CommentController.getCommentById));
router.post(  "/:postId",     authenticate, asyncHandler(CommentController.createComment));
router.patch( "/:postId/:id", authenticate, validateCommentOwner, asyncHandler(CommentController.patchCommentById));
router.delete("/:postId/:id", authenticate, validateCommentOwner, asyncHandler(CommentController.deleteCommentById));

export default router;