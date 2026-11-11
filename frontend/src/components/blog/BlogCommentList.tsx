import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import CommentAPI from "../../api/comments.api";
import BlogComment from "./BlogComment";
import type { Comment } from "../../types/comment";

const COMMENT_MAX = 2000;

function BlogCommentList({ postId }: { postId: string }) {
  const { isLoggedIn } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    CommentAPI.getCommentsByPost(postId)
      .then(setComments)
      .catch(() => setError("Could not load comments."))
      .finally(() => setLoading(false));
  }, [postId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setPosting(true);
    setError("");
    try {
      const created = await CommentAPI.createComment(postId, content.trim());
      setComments((prev) => [created, ...prev]);
      setContent("");
    } catch {
      setError("Failed to post the comment.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <section className="comments" id="comments">
      <div className="section-head">
        <h2>comments</h2><span className="rule" />
        <span className="count">{loading ? "" : comments.length}</span>
      </div>

      {isLoggedIn ? (
        <form onSubmit={handleSubmit} className="panel composer">
          <label className="visually-hidden" htmlFor="comment">Comment</label>
          <textarea
            id="comment"
            className="input prose-input"
            placeholder="Write a comment…"
            value={content}
            maxLength={COMMENT_MAX}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
          />
          <div className="row">
            <span>{content.length} / {COMMENT_MAX}</span>
            <button className="btn sm primary" disabled={posting || !content.trim()}>
              {posting ? "posting…" : "post comment"}
            </button>
          </div>
        </form>
      ) : (
        <p className="panel composer-login">
          <Link to="/login">Log in</Link> or <Link to="/signup">sign up</Link> to join the discussion.
        </p>
      )}

      {error && <p className="alert error">{error}</p>}

      {loading ? (
        <p className="empty loading">loading comments</p>
      ) : comments.length === 0 ? (
        <p className="empty">No comments yet.</p>
      ) : (
        <div>
          {comments.map((c) => (
            <BlogComment key={c._id} postId={postId} comment={c} setComments={setComments} />
          ))}
        </div>
      )}
    </section>
  );
}

export default BlogCommentList;
