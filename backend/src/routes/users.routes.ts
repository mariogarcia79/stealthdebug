import { Router } from "express";
import { asyncHandler } from "../middleware/error.middleware";
import UserController from "../controllers/users.controller";
import { authenticate, checkRole, validateUserId } from "../middleware/auth.middleware";

const router = Router();

router.get(   "/",    authenticate, checkRole("admin"), asyncHandler(UserController.getAllUsers));

router.get(   "/:id", authenticate, validateUserId, asyncHandler(UserController.getUserById));
router.patch( "/:id", authenticate, validateUserId, asyncHandler(UserController.patchUserById));
router.delete("/:id", authenticate, validateUserId, asyncHandler(UserController.deleteUserById));

router.patch( "/pwd/:id", authenticate, validateUserId, asyncHandler(UserController.updateUserPassword));

export default router;
