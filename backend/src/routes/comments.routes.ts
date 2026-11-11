import { Router } from "express";
import { authenticate, optionalAuth, validateCommentOwner } from "../middleware/auth.middleware";
import CommentController from "../controllers/comments.controller";

const router = Router();

router.get(   "/:postId",     optionalAuth, CommentController.getAllComments);
router.get(   "/:postId/:id", CommentController.getCommentById);
router.post(  "/:postId",     authenticate, CommentController.createComment);
router.patch( "/:postId/:id", authenticate, validateCommentOwner, CommentController.patchCommentById);
router.delete("/:postId/:id", authenticate, validateCommentOwner, CommentController.deleteCommentById);

export default router;