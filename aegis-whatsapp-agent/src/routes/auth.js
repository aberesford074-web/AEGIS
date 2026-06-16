import express from "express";
import { exchangeGoogleCode, getGoogleAuthUrl } from "../gmail.js";

export function createAuthRouter(config, store) {
  const router = express.Router();

  router.get("/google", (_req, res) => {
    res.redirect(getGoogleAuthUrl(config));
  });

  router.get("/google/callback", async (req, res, next) => {
    try {
      if (!req.query.code) {
        res.status(400).send("Missing Google OAuth code.");
        return;
      }

      const tokens = await exchangeGoogleCode(config, req.query.code);
      await store.saveGoogleTokens(tokens);
      res.send("Gmail connected. You can close this tab and start the agent.");
    } catch (error) {
      next(error);
    }
  });

  return router;
}
