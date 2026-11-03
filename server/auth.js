const jwt = require("jsonwebtoken");
const { User } = require("./models");

const SESSION_COOKIE = "staffsync_session";
const SESSION_AGE = 8 * 60 * 60 * 1000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function getToken(req) {
  const authorization = req.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice(7);
  }

  const cookie = req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));

  return cookie ? cookie.slice(SESSION_COOKIE.length + 1) : null;
}

async function authenticate(req, res, next) {
  const token = getToken(req);
  if (!token) {
    return next(new HttpError(401, "Please sign in to continue."));
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    const user = await User.findById(payload.sub).select("email role employeeId active");
    if (!user || !user.active) {
      return next(new HttpError(401, "Your session is no longer valid. Please sign in again."));
    }

    req.user = user;
    return next();
  } catch (error) {
    if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
      return next(new HttpError(401, "Your session has expired. Please sign in again."));
    }

    return next(error);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError(403, "You do not have permission to perform this action."));
    }
    return next();
  };
}

function setSession(res, userId) {
  const token = jwt.sign({ sub: String(userId) }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "8h",
  });

  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_AGE,
    path: "/",
  });
}

function clearSession(res) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });
}

module.exports = { HttpError, authenticate, requireRole, setSession, clearSession };
