import { useState } from "react";
import type { Comment } from "../../types/comment";
import { useAuth } from "../../context/AuthContext";
import CommentAPI from "../../api/comments.api";
import { initials, isoDateTime } from "../../utils/format";
import { useI18n } from "../../i18n";

interface BlogCommentProps {
  postId: string;
  comment: Comment;
  setComments: React.Dispatch<React.SetStateAction<Comment[]>>;
}

function BlogComment({ postId, comment, setComments }: BlogCommentProps) {
  const { role, _id: myId } = useAuth();
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const author = comment.author;
  // Authors can delete their own comments; the admin can delete any
  const canDelete = role === "admin" || (!!myId && author?._id === myId);

  const remove = async () => {
    try {
      await CommentAPI.deleteComment(postId, comment._id);
      setComments((prev) => prev.filter((c) => c._id !== comment._id));
    } catch {
      setFailed(true);
      setConfirming(false);
    }
  };

  return (
    <div className="comment">
      <span className="avatar" aria-hidden="true">{initials(author?.name)}</span>
      <div>
        <div className="who">
          {author ? <b>{author.name}</b> : <span className="deleted">{t("comments.deletedUser")}</span>}
          <time dateTime={comment.createdAt}>{isoDateTime(comment.createdAt)}</time>
          {canDelete && (
            confirming ? (
              <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button className="btn sm danger" onClick={remove}>{t("comments.deleteYes")}</button>
                <button className="btn sm ghost" onClick={() => setConfirming(false)}>{t("comments.cancel")}</button>
              </span>
            ) : (
              <button className="btn sm ghost" onClick={() => setConfirming(true)}>{t("comments.delete")}</button>
            )
          )}
        </div>
        <p>{comment.content}</p>
        {failed && <p className="alert error" style={{ marginTop: 8 }}>{t("comments.deleteFailed")}</p>}
      </div>
    </div>
  );
}

export default BlogComment;
