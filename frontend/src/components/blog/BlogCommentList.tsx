import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import CommentAPI from "../../api/comments.api";
import BlogComment from "./BlogComment";
import type { Comment } from "../../types/comment";
import { useI18n } from "../../i18n";

const COMMENT_MAX = 2000;

function BlogCommentList({ postId }: { postId: string }) {
  const { isLoggedIn } = useAuth();
  const { t } = useI18n();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    CommentAPI.getCommentsByPost(postId)
      .then(setComments)
      .catch(() => setError("comments.loadError"))
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
      setError("comments.postError");
    } finally {
      setPosting(false);
    }
  };

  return (
    <section className="comments" id="comments">
      <div className="section-head">
        <h2>{t("comments.title")}</h2><span className="rule" />
        <span className="count">{loading ? "" : comments.length}</span>
      </div>

      {isLoggedIn ? (
        <form onSubmit={handleSubmit} className="panel composer">
          <label className="visually-hidden" htmlFor="comment">{t("comments.label")}</label>
          <textarea
            id="comment"
            className="input prose-input"
            placeholder={t("comments.placeholder")}
            value={content}
            maxLength={COMMENT_MAX}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
          />
          <div className="row">
            <span>{t("comments.publicNote")} · {content.length} / {COMMENT_MAX}</span>
            <button className="btn sm primary" disabled={posting || !content.trim()}>
              {posting ? t("comments.posting") : t("comments.post")}
            </button>
          </div>
        </form>
      ) : (
        <p className="panel composer-login">
          <Link to="/login">{t("comments.loginPrompt1")}</Link>{t("comments.loginPrompt2")}<Link to="/signup">{t("comments.loginPrompt3")}</Link>{t("comments.loginPrompt4")}
        </p>
      )}

      {error && <p className="alert error">{t(error as "comments.loadError" | "comments.postError")}</p>}

      {loading ? (
        <p className="empty loading">{t("comments.loading")}</p>
      ) : comments.length === 0 ? (
        <p className="empty">{t("comments.none")}</p>
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
