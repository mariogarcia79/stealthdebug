import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import type { User, UserUpdate } from "../../types/user";
import UsersAPI from "../../api/users.api";
import { isoDate } from "../../utils/format";
import { useI18n } from "../../i18n";

type Msg = { ok: boolean; text: string } | null;

function Message({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return <p className={`alert ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</p>;
}

const UserDashboard = () => {
  const { _id: contextUserId, logout, role, isLoading } = useAuth();
  const { userId: routeUserId } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const _id = routeUserId ?? contextUserId;
  const viewingOther = !!routeUserId;

  const [userData, setUserData] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [profileMsg, setProfileMsg] = useState<Msg>(null);
  const [passwordMsg, setPasswordMsg] = useState<Msg>(null);
  const [deleteMsg, setDeleteMsg] = useState<Msg>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (routeUserId && (routeUserId === contextUserId || role !== "admin")) navigate("/dashboard");
  }, [routeUserId, contextUserId, role, navigate, isLoading]);

  useEffect(() => {
    if (!_id) { setLoading(false); return; }
    UsersAPI.getUserById(_id)
      .then((user) => { setUserData(user); setName(user.name); setEmail(user.email); })
      .finally(() => setLoading(false));
  }, [_id]);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!_id) return;
    const data: UserUpdate = { _id, name, email };
    try {
      setUserData(await UsersAPI.updateUserById(data));
      setProfileMsg({ ok: true, text: t("account.profileSaved") });
    } catch {
      setProfileMsg({ ok: false, text: t("account.profileFailed") });
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!_id) return;
    if (newPassword !== newPasswordConfirm) {
      setPasswordMsg({ ok: false, text: t("account.passwordMismatch") });
      return;
    }
    try {
      await UsersAPI.updateUserPassword({ _id, currentPassword, newPassword });
      setPasswordMsg({ ok: true, text: t("account.passwordChanged") });
      setCurrentPassword(""); setNewPassword(""); setNewPasswordConfirm("");
    } catch {
      setPasswordMsg({ ok: false, text: t("account.passwordFailed") });
    }
  };

  const deleteUser = async () => {
    if (!_id) return;
    try {
      await UsersAPI.deleteUserById(_id);
      if (_id === contextUserId) { logout(); navigate("/"); }
      else navigate("/users");
    } catch {
      setDeleteMsg({ ok: false, text: t("account.deleteFailed") });
      setConfirmDelete(false);
    }
  };

  if (isLoading || loading) return <div className="wrap"><p className="empty loading page-msg">{t("account.loading")}</p></div>;
  if (!contextUserId) return <div className="wrap"><p className="empty page-msg">{t("account.mustLogin1")}<Link to="/login" className="link">{t("account.mustLogin2")}</Link>.</p></div>;
  if (!userData) return <div className="wrap"><p className="empty page-msg">{t("account.notFound")} <Link to={role === "admin" ? "/users" : "/"} className="link">{t("account.goBack")}</Link></p></div>;

  // An admin can't delete their own account from here (avoids locking yourself out)
  const canDelete = viewingOther || role !== "admin";

  return (
    <div className="wrap">
      <div className="page-head">
        <div>
          <div className="eyebrow">
            {viewingOther ? <Link to="/users" className="link">~/users</Link> : <><span className="p">$</span> <span className="c">id</span></>}
          </div>
          <h1>{viewingOther ? userData.name : t("account.title")}</h1>
        </div>
      </div>

      <div className="stack">
        <section className="panel settings">
          <div className="panel-bar"><span>{t("account.profile")}</span><span>{userData.role ?? "user"}</span></div>
          <div className="panel-body">
            <dl className="kv">
              <dt>{t("auth.name")}</dt><dd>{userData.name}</dd>
              <dt>{t("auth.email")}</dt><dd>{userData.email}</dd>
              <dt>{t("account.joined")}</dt><dd>{userData.createdAt ? isoDate(userData.createdAt) : "—"}</dd>
            </dl>
          </div>
        </section>

        <form className="panel settings" onSubmit={saveProfile}>
          <div className="panel-bar"><span>{t("account.editProfile")}</span></div>
          <div className="panel-body">
            <div className="grid-2">
              <div className="field"><label htmlFor="p-name">{t("auth.name")}</label><input id="p-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="field"><label htmlFor="p-email">{t("auth.email")}</label><input id="p-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            </div>
            <div className="actions"><button className="btn primary sm">{t("account.saveProfile")}</button></div>
            <Message msg={profileMsg} />
          </div>
        </form>

        {!viewingOther && (
          <form className="panel settings" onSubmit={changePassword}>
            <div className="panel-bar"><span>{t("account.changePassword")}</span></div>
            <div className="panel-body">
              <div className="field"><label htmlFor="pw-cur">{t("account.currentPassword")}</label><input id="pw-cur" type="password" autoComplete="current-password" className="input" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></div>
              <div className="grid-2">
                <div className="field"><label htmlFor="pw-new">{t("account.newPassword")}</label><input id="pw-new" type="password" autoComplete="new-password" className="input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
                <div className="field"><label htmlFor="pw-rep">{t("account.repeatPassword")}</label><input id="pw-rep" type="password" autoComplete="new-password" className="input" value={newPasswordConfirm} onChange={(e) => setNewPasswordConfirm(e.target.value)} /></div>
              </div>
              <div className="actions"><button className="btn primary sm">{t("account.updatePassword")}</button></div>
              <Message msg={passwordMsg} />
            </div>
          </form>
        )}

        {!viewingOther && (
          <section className="panel settings">
            <div className="panel-bar"><span>{t("account.yourData")}</span></div>
            <div className="panel-body">
              <p className="muted note">
                {t("account.yourDataText")} <Link to="/privacy" className="link">{t("account.privacyLink")}</Link>
              </p>
            </div>
          </section>
        )}

        <section className="panel settings danger">
          <div className="panel-bar"><span>{t("account.danger")}</span></div>
          <div className="panel-body">
            <p className="muted note">
              {!canDelete ? t("account.adminNoDelete") : viewingOther ? t("account.deleteInfoOther") : t("account.deleteInfo")}
            </p>
            <div className="actions">
              {confirmDelete ? (
                <>
                  <button className="btn sm danger" onClick={deleteUser}>{viewingOther ? t("account.deleteYesOther", { name: userData.name }) : t("account.deleteYesMine")}</button>
                  <button className="btn sm ghost" onClick={() => setConfirmDelete(false)}>{t("account.cancel")}</button>
                </>
              ) : (
                <button className="btn sm danger" disabled={!canDelete} onClick={() => setConfirmDelete(true)}>{t("account.deleteButton")}</button>
              )}
            </div>
            <Message msg={deleteMsg} />
          </div>
        </section>
      </div>
    </div>
  );
};

export default UserDashboard;
