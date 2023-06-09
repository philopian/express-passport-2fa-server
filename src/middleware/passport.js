require("dotenv").config();
const passport = require("passport");
const passportJWT = require("passport-jwt");
const bcrypt = require("bcryptjs");
const LocalStrategy = require("passport-local").Strategy;
const { authenticator } = require("otplib");

const prisma = require("../util/prisma");

const JwtStrategy = passportJWT.Strategy;
const ExtractJwt = passportJWT.ExtractJwt;
const config = require("../config");

const { jwtStrategy } = config;

// Local Strategy
passport.use(
  jwtStrategy.login,
  new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "password",
      session: false,
    },
    async (email, password, done) => {
      try {
        // Check to see if user exist in DB
        const user = await prisma.users.findUnique({ where: { email } });
        if (!user) return done(null, false);

        // Check to see if the password matches
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return done(null, false);

        return done(null, user);
      } catch (error) {
        return done(error, false);
      }
    }
  )
);

passport.use(
  jwtStrategy.defaultJwt,
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET,
    },
    async (jwtPayload, done) => {
      try {
        const user = await prisma.users.findUnique({ where: { id: jwtPayload.sub } });
        if (!user) return done(null, false);

        // *NOTE*: MAYBE Force user to have to MFA with Google Authenticator
        // if (!jwtPayload.mfaValid) return done(null, false);
        // *NOTE*: MAYBE Force user to have to MFA with Google Authenticator

        return done(null, { ...user, mfaValid: jwtPayload.mfaValid });
      } catch (error) {
        return done(error, false);
      }
    }
  )
);

passport.use(
  jwtStrategy.googleAuthenticatorQr,
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_MFA_SECRET,
    },
    async (jwtPayload, done) => {
      try {
        const user = await prisma.users.findUnique({ where: { id: jwtPayload.sub } });
        if (!user) return done(null, false);
        return done(null, user);
      } catch (error) {
        return done(error, false);
      }
    }
  )
);

passport.use(
  jwtStrategy.googleAuthenticator,
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_MFA_SECRET,
      passReqToCallback: true,
    },

    async (req, jwtPayload, done) => {
      try {
        // Verify user exist in the DB
        const user = await prisma.users.findUnique({ where: { id: jwtPayload.sub } });
        if (!user) return done(null, false);

        // Make sure the MFA code is passed in
        const { code } = req.body;
        if (!code) return done(null, false);

        // Verify with authenticator
        const { MFA_SECRET } = process.env;
        const mfaValid = authenticator.verify({ token: code, secret: MFA_SECRET });
        if (!mfaValid) return done(null, false);

        return done(null, user);
      } catch (error) {
        return done(error, false);
      }
    }
  )
);

function now() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const formattedDate = `${year}/${month.toString().padStart(2, "0")}/${day.toString().padStart(2, "0")} ${hours
    .toString()
    .padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  return formattedDate;
}

passport.use(
  jwtStrategy.refreshJwt,
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_REFRESH_SECRET,
      passReqToCallback: true,
    },

    async (req, jwtPayload, done) => {
      console.log("🚀 ~ REFRESH!!", now());
      try {
        const user = await prisma.users.findUnique({ where: { id: jwtPayload.sub } });
        if (!user) return done(null, false);

        return done(null, { ...user, mfaValid: jwtPayload.mfaValid });
      } catch (error) {
        return done(error, false);
      }
    }
  )
);
