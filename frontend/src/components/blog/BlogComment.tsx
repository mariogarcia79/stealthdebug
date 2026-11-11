import { useState } from "react";
import type { Comment } from "../../types/comment";
import { useAuth } from "../../context/AuthContext";
import CommentAPI from "../../api/comments.api";
import { initials, isoDateTime } from "../../utils/format";

interface BlogCommentProps {
  postId: string;
  comment: Comment;
  setComments: React.Dispatch<React.SetStateAction<Comment[]>>;
}

function BlogComment({ postId, comment, setComments }: BlogCommentProps) {
  const { role } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const author = comment.author;

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
          {author ? <b>{author.name}</b> : <span className="deleted">deleted user</span>}
          <time dateTime={comment.createdAt}>{isoDateTime(comment.createdAt)}</time>
          {role === "admin" && (
            confirming ? (
              <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button className="btn sm danger" onClick={remove}>delete</button>
                <button className="btn sm ghost" onClick={() => setConfirming(false)}>cancel</button>
              </span>
            ) : (
              <button className="btn sm ghost" onClick={() => setConfirming(true)}>delete</button>
            )
          )}
        </div>
        <p>{comment.content}</p>
        {failed && <p className="alert error" style={{ marginTop: 8 }}>Failed to delete the comment.</p>}
      </div>
    </div>
  );
}

export default BlogComment;
