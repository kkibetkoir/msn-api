const express = require("express");
const axios = require("axios");
const NodeCache = require("node-cache");
const cors = require("cors");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const app = express();
const PORT = process.env.PORT || 3000;

// ============ MIDDLEWARE ============
app.use(cors());
app.use(compression());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: { success: false, error: "Too many requests, please try again later." }
});
app.use("/api", limiter);

// ============ CONFIGURATION ============
const CONFIG = {
  msn: {
    baseUrl: "https://api.msn.com/sports",
    apiKey: "kO1dI4ptCTTylLkPL1ZTHYP8JhLKb8mRDoA5yotmNJ",
    defaultParams: {
      version: "1.0",
      cm: "en-xl",
      ocid: "sports-gamecenter",
      it: "edgeid",
      user: "m-100EF0BD81AE6004389EE557802C619D",
      scn: "APP_ANON",
    }
  },
  cache: {
    stdTTL: 300,
    checkperiod: 60
  }
};

// ============ CACHE ============
const cache = new NodeCache({ 
  stdTTL: CONFIG.cache.stdTTL,
  checkperiod: CONFIG.cache.checkperiod,
});

// ============ MSN SPORTS API SERVICE ============
class MSNSportsService {
  constructor() {
    this.baseUrl = CONFIG.msn.baseUrl;
    this.apiKey = CONFIG.msn.apiKey;
    this.defaultParams = CONFIG.msn.defaultParams;
  }

  buildUrl(endpoint, additionalParams = {}) {
    const params = new URLSearchParams({
      apikey: this.apiKey,
      ...this.defaultParams,
      ...additionalParams,
    });
    return `${this.baseUrl}/${endpoint}?${params.toString()}`;
  }

  async fetchWithTimeout(url, timeout = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  // ============ MSN SPORTS ENDPOINTS ============

  // 1. Get team players with injuries
  async getTeamPlayers(teamIds, scope = "Injuries") {
    const ids = Array.isArray(teamIds) ? teamIds.join(",") : teamIds;
    const url = this.buildUrl("teamplayers", {
      ids: ids,
      scope: scope,
      activityId: this.generateActivityId(),
    });
    return this.fetchWithTimeout(url);
  }

  // 2. Get game statistics
  async getGameStatistics(gameIds, options = {}) {
    const {
      type = "Game",
      scope = "Playergame",
      sport = "IceHockey",
      leagueid = "IceHockey_NHL"
    } = options;
    
    const ids = Array.isArray(gameIds) ? gameIds.join(",") : gameIds;
    const url = this.buildUrl("statistics", {
      ids: ids,
      type: type,
      scope: scope,
      sport: sport,
      leagueid: leagueid,
      activityId: this.generateActivityId(),
    });
    return this.fetchWithTimeout(url);
  }

  // 3. Get live schedules
  async getLiveSchedules(params = {}) {
    const {
      ids,
      take = 7,
      type = "TeamSchedule",
      tzoffset = 3
    } = params;

    const url = this.buildUrl("liveschedules", {
      ids: ids,
      take: take,
      type: type,
      tzoffset: tzoffset,
      activityId: this.generateActivityId(),
    });
    return this.fetchWithTimeout(url);
  }

  // 4. Get entity header
  async getEntityHeader(params = {}) {
    const {
      id,
      type = "League",
      pagetypes = "LeagueHome,Scores,Schedule,Standings,Teams,Team,GameCenter,TeamRoster,Player,PlayerStats,TeamStats,Polls,Videos,TourCalendar,TourRankings,RaceCalendar,DriverStandings,ICCRankings,Rankings,Bracket,Statistics,Headlines,Tournament,Results,Medals,TeamSchedule,TeamMedals,TeamResults"
    } = params;

    const url = this.buildUrl("entityheader", {
      id: id,
      type: type,
      pagetypes: pagetypes,
      activityId: this.generateActivityId(),
    });
    return this.fetchWithTimeout(url);
  }

  // 5. Get leagues
  async getLeagues(leagueIds, scope = "entityHeader") {
    const ids = Array.isArray(leagueIds) ? leagueIds.join(",") : leagueIds;
    const url = this.buildUrl("leagues", {
      ids: ids,
      scope: scope,
      activityId: this.generateActivityId(),
    });
    return this.fetchWithTimeout(url);
  }

  // 6. Get live around the league
  async getLiveAroundLeague(params = {}) {
    const {
      datetime,
      tzoffset = 3,
      id,
      sport,
      withleaguereco = true
    } = params;

    const urlParams = {
      datetime: datetime,
      tzoffset: tzoffset,
      withleaguereco: withleaguereco,
      activityId: this.generateActivityId(),
    };

    if (id) urlParams.id = id;
    if (sport) urlParams.sport = sport;

    const url = this.buildUrl("livearoundtheleague", urlParams);
    return this.fetchWithTimeout(url);
  }

  // 7. Get live games
  async getLiveGames(gameIds, scope = "Full") {
    const ids = Array.isArray(gameIds) ? gameIds.join(",") : gameIds;
    const url = this.buildUrl("livegames", {
      ids: ids,
      scope: scope,
      activityId: this.generateActivityId(),
    });
    return this.fetchWithTimeout(url);
  }

  // 8. Get standings
  async getStandings(params = {}) {
    const {
      id,
      idtype = "team",
      standingstype = "division",
      seasonPhase = "regularSeason"
    } = params;

    const url = this.buildUrl("standings", {
      id: id,
      idtype: idtype,
      standingstype: standingstype,
      seasonPhase: seasonPhase,
      activityId: this.generateActivityId(),
    });
    return this.fetchWithTimeout(url);
  }

  // 9. Get game timeline (play-by-play)
  async getGameTimeline(gameId, scope = "playbyplay") {
    const url = this.buildUrl("timeline", {
      gameid: gameId,
      sport: "IceHockey",
      scope: scope,
      activityId: this.generateActivityId(),
    });
    return this.fetchWithTimeout(url);
  }

  // 10. Get top players
  async getTopPlayers(gameId, options = {}) {
    const {
      type = "Game",
      sport = "IceHockey",
      leagueid = "IceHockey_NHL"
    } = options;

    const url = this.buildUrl("topplayers", {
      ids: gameId,
      type: type,
      sport: sport,
      leagueid: leagueid,
      activityId: this.generateActivityId(),
    });
    return this.fetchWithTimeout(url);
  }

  // 11. Get videos
  async getVideos(gameId) {
    const url = this.buildUrl("videos", {
      ids: gameId,
      activityId: this.generateActivityId(),
    });
    return this.fetchWithTimeout(url);
  }

  // 12. Get personalization strip
  async getPersonalizationStrip(params = {}) {
    const {
      lat = -1.2841,
      long = 36.8155,
      type = "SportsVertical",
      flights = "msnallexpusers,prg-sp-liveapi,fv-ugc-staginc,prg-rmvfollowing,prg-nofollowing,prg-pr2-nofollow,1s-wpo-pr1-maibar-t4,routegraphexp,prg-adspeek,prg-sv1plus-stag,btie-msanranking-t01,btie-bsgpt5-t,1s-fcrypt,prg-1sw-sa-freshv2t31,prg-upsaip-w1-t,1s-rpssecautht,prg-msal224-b,prg-pr2-dmat,prg-pr2-dmabrowser,chatn_v2_t1,1s-shp-rec-idb,1s-idbsqlreqvon,1s-sh-idburlchkon,1s-sh-idburobseon,1s-sh-recrelft3,1s-shp-idbursov2,t-prg-ntp-glasis-ho,prg-ntp-eacs,prg-ntp-glasitp-3,1s-wpo-holdout-c,1s-wpo-ntp-sdtbv3,1s-wpo-pr2-maibar-t3,prg-sh-rmitmlnk,prg-shopping-api,nopinglancecardit,prg-1s-otel,prg-ntp-cimsds-2,prg-expgooglets,prg-ntp-tscsi,prg-cg-ad-ref-if-c,nonmobile-t,ads-nopostsq-t,ads-nopostsq,1s-uasdisf-t,ads-usepme,fv-cg-stage,ads-anjson-migt,ads-nouniformcrlog,sh-bdvid,prg-sh-bd-video,d3g73340,ads-nooutbrain,release-outlook-app,ads-prcrid-bi,cg-ab-testing-c,1s-p2-bg-appanon,ads-bcn-cndomain,prg-cg-int-ad-pod,1s-ntp-tredisc,msph-benchmark,prg-pr2-lifecycleba,1s-pr2-evlcbackingapp,1s-shoppingexpt,ntp-rsshimopth,ntp-rsshimopt,prg-1sw-crypinf,prg-cg-lock_c,prg-1sw-cryptren,prg-cg-zhcnfx,prg-cg-lstfix,prg-bl-pblsrs-c,prg-1sw-tbrfltr,prg-1sw-tvid-int-t1,1s-p1-vid-vs-int,prg-1sw-tvid-p1-int,prg-1sw-videopb,prg-1sw-videosxap,prg-p1-txt2,prg-p1-uc3,prg-pr1-videos,prg-tv-api,prg-tv-segcap10,prg-vid-trdcache,prg-1sw-tvid-int-t2,1s-p2-vid-vp-int,prg-1sw-tvid-p2-int,prg-p2-txt2,prg-p2-uc3,prg-pr2-setdur-t2,prg-pr2-videos,prg-pr2-wtab-oo,prg-tv-p2-api,prg-tv-p2-segcap10,btie-msanrr-t11,prg-pr2-wwidgets-t,bing_native_chat_t,prg-1s-dwvid-wpo-ctr,1s-newsfeed-worknews,bing_uni_iab_t,prg-pr2-imghttd-t,prg-pr2-imghtdd-t,btie-msanrr-upv-t14,prg-1sw-newe2e,1s-ls-uppermuid,c-prg-ntp-tpqapi,1s-mailman-auth,prg-1sw-wxncvf,1s-xap-bnts-t1,1s-xap-bnts,prg-ntp-bn1sept,prg-1sw-wxtrlog,prg-pr2-spscorexpc,prg-pr2-ntf-rel,prg-1sw-pawpor1,prg-1sw-spawpor1,prg-1sw-ntf-rel,prg-1sw-dwvid-wpo-2,1s-wpo-ntp-videos2,prg-1sw-sfexpdat,1s-ntfa-fpmeta,prg-1sw-analysisdata,prg-1sw-p2-txt3-c,ads-3pctve-filter,prg-ad-tmt,prg-1sw-subup,1s-wpo-ntpdgst,prg-db-subcrdsct1s,prg-rbssrless,prg-1sw-finidm,prg-1sw-hide-lckprev,1s-hide-lckprev,prg-1sw-dw-rank-c,cntrl1s-p2-cmp-t,1s-cntravelermuidp2,1s-cntravelerprong2,cetoredirectp2,expose-pcn-flag,prg-pr2-msnupqsp,prg-pr2-aadpmiti,msphxap-chatbot,prg-pr2-twi-99,prg-pr2-reclaim,prg-pr2-sr-10,prg-1sw-nichentpt3,1s-dgg-niche,1s-edxog,prg-1sw-niche2rowntp,prg-1sw-sa-ig5rubyc,prg-1sw-saigrelt3,prg-dis-nicheca,prg-rb-lgap2,prg-1sw-uphigh,prg-1sw-lottie,1s-wpo-vlog,prg-ruby-defid,prg-pr2-lottie-tbr,prg-pr2-lottie-brds,prg-1sw-lottie-r,1s-featureservice-t,prg-ntp-codexmcmurlc,prg-1sw-rndebugen,prg-ad-ot-ip-t,prg-ad-ot-ip,prg-ad-wea-bdupe,1s-xapretry-t,msph-botupdate,remunloadflt,prg-ntpasppc,prg-ntp-cpcwas,prg-msal4,1s-prg-zero-r2-rubyn,prg-ntp-verifynlv2,msph-revagvnext,c-comp-dsa-atd,disablecohort,prg-adden-c,prg-wx-api2ass,prg-pr2-nupdate,msph-cmsprefeed,prg-cg-inf-rec,prg-1sw-teamwidsrt1,prg-1sw-teamhash,prg-r-wtch-ovnad-c,prg-1sw-lctmfixt1,prg-1sw-lctmfr"
    } = params;

    const url = this.buildUrl("personalizationstrip", {
      lat: lat,
      long: long,
      type: type,
      flights: flights,
      activityId: this.generateActivityId(),
    });
    return this.fetchWithTimeout(url);
  }

  // Helper: Generate unique activity ID
  generateActivityId() {
    return crypto.randomUUID ? crypto.randomUUID() : 
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
  }
}

const msnService = new MSNSportsService();

// ============ DATA TRANSFORMERS ============
class DataTransformer {
  static transformTeamPlayers(data) {
    if (!data) return null;
    return {
      teams: data.teams || [],
      players: data.players || [],
      injuries: (data.injuries || []).map(injury => ({
        playerId: injury.player_id,
        playerName: injury.player_name,
        teamId: injury.team_id,
        injuryType: injury.injury_type,
        status: injury.status,
        expectedReturn: injury.expected_return,
        updated: injury.updated
      })),
      totalPlayers: data.players?.length || 0,
      totalInjured: data.injuries?.length || 0
    };
  }

  static transformGameStats(data) {
    if (!data) return null;
    return {
      homeTeam: {
        id: data.home_team?.id,
        name: data.home_team?.name,
        score: data.home_team?.score,
        stats: data.home_team?.stats || {}
      },
      awayTeam: {
        id: data.away_team?.id,
        name: data.away_team?.name,
        score: data.away_team?.score,
        stats: data.away_team?.stats || {}
      },
      playerStats: (data.players || []).map(player => ({
        id: player.id,
        name: player.name,
        team: player.team,
        position: player.position,
        stats: player.stats || {}
      })),
      gameStatus: data.game_status,
      period: data.period,
      timeRemaining: data.time_remaining
    };
  }

  static transformSchedule(data) {
    if (!data) return null;
    return {
      teamId: data.team_id,
      teamName: data.team_name,
      games: (data.games || []).map(game => ({
        id: game.id,
        date: game.date,
        time: game.time,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        venue: game.venue,
        status: game.status,
        result: game.result
      })),
      totalGames: data.games?.length || 0
    };
  }

  static transformStandings(data) {
    if (!data) return null;
    return {
      division: data.division,
      conference: data.conference,
      teams: (data.teams || []).map(team => ({
        id: team.id,
        name: team.name,
        wins: team.wins,
        losses: team.losses,
        ties: team.ties,
        points: team.points,
        gamesPlayed: team.games_played,
        winPercentage: team.win_percentage,
        streak: team.streak,
        lastTen: team.last_ten
      })),
      totalTeams: data.teams?.length || 0
    };
  }

  static transformTimeline(data) {
    if (!data) return null;
    return {
      gameId: data.game_id,
      events: (data.events || []).map(event => ({
        time: event.time,
        period: event.period,
        type: event.type,
        description: event.description,
        team: event.team,
        player: event.player,
        details: event.details || {}
      })),
      totalEvents: data.events?.length || 0
    };
  }

  static transformTopPlayers(data) {
    if (!data) return null;
    return {
      gameId: data.game_id,
      players: (data.players || []).map(player => ({
        id: player.id,
        name: player.name,
        team: player.team,
        position: player.position,
        stats: player.stats || {},
        highlights: player.highlights || []
      })),
      categories: data.categories || []
    };
  }

  static transformLiveGames(data) {
    if (!data) return null;
    return {
      games: (data.games || []).map(game => ({
        id: game.id,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        homeScore: game.home_score,
        awayScore: game.away_score,
        status: game.status,
        period: game.period,
        timeRemaining: game.time_remaining,
        venue: game.venue,
        isLive: game.is_live,
        isFinal: game.is_final
      })),
      totalGames: data.games?.length || 0,
      liveGames: data.games?.filter(g => g.is_live)?.length || 0
    };
  }
}

// ============ API ROUTES ============

/**
 * @route GET /api/msn/teamplayers
 * @desc Get team players with injuries
 * @query {string} teamIds - Comma-separated team IDs (required)
 * @query {string} scope - Data scope (default: Injuries)
 */
app.get("/api/msn/teamplayers", async (req, res) => {
  const { teamIds, scope = "Injuries" } = req.query;
  
  if (!teamIds) {
    return res.status(400).json({
      success: false,
      error: "teamIds parameter is required",
      usage: "/api/msn/teamplayers?teamIds=TEAM_ID_1,TEAM_ID_2&scope=Injuries"
    });
  }

  const cacheKey = `msn_teamplayers_${teamIds}_${scope}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return res.json({ success: true, source: "cache", data: cached });
  }

  try {
    const data = await msnService.getTeamPlayers(teamIds, scope);
    const transformed = DataTransformer.transformTeamPlayers(data);
    cache.set(cacheKey, transformed);
    res.json({ 
      success: true, 
      source: "api", 
      data: transformed,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route GET /api/msn/gamestats
 * @desc Get game statistics
 * @query {string} gameIds - Comma-separated game IDs (required)
 * @query {string} scope - Data scope (Playergame, Teamgame)
 * @query {string} sport - Sport type (default: IceHockey)
 * @query {string} leagueid - League ID (default: IceHockey_NHL)
 */
app.get("/api/msn/gamestats", async (req, res) => {
  const { gameIds, scope = "Playergame", sport = "IceHockey", leagueid = "IceHockey_NHL" } = req.query;

  if (!gameIds) {
    return res.status(400).json({
      success: false,
      error: "gameIds parameter is required",
      usage: "/api/msn/gamestats?gameIds=GAME_ID_1,GAME_ID_2&scope=Playergame"
    });
  }

  const cacheKey = `msn_gamestats_${gameIds}_${scope}_${sport}_${leagueid}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return res.json({ success: true, source: "cache", data: cached });
  }

  try {
    const data = await msnService.getGameStatistics(gameIds, { scope, sport, leagueid });
    const transformed = DataTransformer.transformGameStats(data);
    cache.set(cacheKey, transformed);
    res.json({ 
      success: true, 
      source: "api", 
      data: transformed,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route GET /api/msn/schedule
 * @desc Get team schedule
 * @query {string} teamId - Team ID (required)
 * @query {number} take - Number of games (default: 7)
 */
app.get("/api/msn/schedule", async (req, res) => {
  const { teamId, take = 7 } = req.query;

  if (!teamId) {
    return res.status(400).json({
      success: false,
      error: "teamId parameter is required",
      usage: "/api/msn/schedule?teamId=TEAM_ID&take=7"
    });
  }

  const cacheKey = `msn_schedule_${teamId}_${take}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return res.json({ success: true, source: "cache", data: cached });
  }

  try {
    const data = await msnService.getLiveSchedules({ ids: teamId, take: parseInt(take) });
    const transformed = DataTransformer.transformSchedule(data);
    cache.set(cacheKey, transformed);
    res.json({ 
      success: true, 
      source: "api", 
      data: transformed,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route GET /api/msn/entityheader
 * @desc Get entity header
 * @query {string} id - Entity ID (required)
 * @query {string} type - Entity type (League, Team, Player)
 */
app.get("/api/msn/entityheader", async (req, res) => {
  const { id, type = "League" } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      error: "id parameter is required",
      usage: "/api/msn/entityheader?id=ENTITY_ID&type=League"
    });
  }

  const cacheKey = `msn_entityheader_${id}_${type}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return res.json({ success: true, source: "cache", data: cached });
  }

  try {
    const data = await msnService.getEntityHeader({ id, type });
    cache.set(cacheKey, data);
    res.json({ 
      success: true, 
      source: "api", 
      data: data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route GET /api/msn/livegames
 * @desc Get live games
 * @query {string} gameIds - Comma-separated game IDs (required)
 * @query {string} scope - Data scope (Full, Basic)
 */
app.get("/api/msn/livegames", async (req, res) => {
  const { gameIds, scope = "Full" } = req.query;

  if (!gameIds) {
    return res.status(400).json({
      success: false,
      error: "gameIds parameter is required",
      usage: "/api/msn/livegames?gameIds=GAME_ID_1,GAME_ID_2&scope=Full"
    });
  }

  const cacheKey = `msn_livegames_${gameIds}_${scope}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return res.json({ success: true, source: "cache", data: cached });
  }

  try {
    const data = await msnService.getLiveGames(gameIds, scope);
    const transformed = DataTransformer.transformLiveGames(data);
    cache.set(cacheKey, transformed);
    res.json({ 
      success: true, 
      source: "api", 
      data: transformed,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route GET /api/msn/standings
 * @desc Get standings
 * @query {string} teamId - Team ID (required)
 * @query {string} type - Standing type (division, conference, league)
 */
app.get("/api/msn/standings", async (req, res) => {
  const { teamId, type = "division" } = req.query;

  if (!teamId) {
    return res.status(400).json({
      success: false,
      error: "teamId parameter is required",
      usage: "/api/msn/standings?teamId=TEAM_ID&type=division"
    });
  }

  const cacheKey = `msn_standings_${teamId}_${type}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return res.json({ success: true, source: "cache", data: cached });
  }

  try {
    const data = await msnService.getStandings({ id: teamId, standingstype: type });
    const transformed = DataTransformer.transformStandings(data);
    cache.set(cacheKey, transformed);
    res.json({ 
      success: true, 
      source: "api", 
      data: transformed,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route GET /api/msn/timeline
 * @desc Get game timeline (play-by-play)
 * @query {string} gameId - Game ID (required)
 */
app.get("/api/msn/timeline", async (req, res) => {
  const { gameId } = req.query;

  if (!gameId) {
    return res.status(400).json({
      success: false,
      error: "gameId parameter is required",
      usage: "/api/msn/timeline?gameId=GAME_ID"
    });
  }

  const cacheKey = `msn_timeline_${gameId}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return res.json({ success: true, source: "cache", data: cached });
  }

  try {
    const data = await msnService.getGameTimeline(gameId);
    const transformed = DataTransformer.transformTimeline(data);
    cache.set(cacheKey, transformed);
    res.json({ 
      success: true, 
      source: "api", 
      data: transformed,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route GET /api/msn/topplayers
 * @desc Get top players for a game
 * @query {string} gameId - Game ID (required)
 */
app.get("/api/msn/topplayers", async (req, res) => {
  const { gameId } = req.query;

  if (!gameId) {
    return res.status(400).json({
      success: false,
      error: "gameId parameter is required",
      usage: "/api/msn/topplayers?gameId=GAME_ID"
    });
  }

  const cacheKey = `msn_topplayers_${gameId}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return res.json({ success: true, source: "cache", data: cached });
  }

  try {
    const data = await msnService.getTopPlayers(gameId);
    const transformed = DataTransformer.transformTopPlayers(data);
    cache.set(cacheKey, transformed);
    res.json({ 
      success: true, 
      source: "api", 
      data: transformed,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route GET /api/msn/leagues
 * @desc Get league information
 * @query {string} leagueIds - Comma-separated league IDs (required)
 */
app.get("/api/msn/leagues", async (req, res) => {
  const { leagueIds } = req.query;

  if (!leagueIds) {
    return res.status(400).json({
      success: false,
      error: "leagueIds parameter is required",
      usage: "/api/msn/leagues?leagueIds=LEAGUE_ID_1,LEAGUE_ID_2"
    });
  }

  const cacheKey = `msn_leagues_${leagueIds}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return res.json({ success: true, source: "cache", data: cached });
  }

  try {
    const data = await msnService.getLeagues(leagueIds);
    cache.set(cacheKey, data);
    res.json({ 
      success: true, 
      source: "api", 
      data: data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route GET /api/msn/livearoundleague
 * @desc Get live around the league
 * @query {string} datetime - Datetime in ISO format (required)
 * @query {string} id - League ID (optional)
 * @query {string} sport - Sport type (optional)
 */
app.get("/api/msn/livearoundleague", async (req, res) => {
  const { datetime, id, sport } = req.query;

  if (!datetime) {
    return res.status(400).json({
      success: false,
      error: "datetime parameter is required",
      usage: "/api/msn/livearoundleague?datetime=2025-12-17T04:21:49&id=LEAGUE_ID"
    });
  }

  const cacheKey = `msn_livearoundleague_${datetime}_${id || 'all'}_${sport || 'all'}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return res.json({ success: true, source: "cache", data: cached });
  }

  try {
    const data = await msnService.getLiveAroundLeague({ datetime, id, sport });
    cache.set(cacheKey, data);
    res.json({ 
      success: true, 
      source: "api", 
      data: data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route GET /api/msn/videos
 * @desc Get game videos
 * @query {string} gameId - Game ID (required)
 */
app.get("/api/msn/videos", async (req, res) => {
  const { gameId } = req.query;

  if (!gameId) {
    return res.status(400).json({
      success: false,
      error: "gameId parameter is required",
      usage: "/api/msn/videos?gameId=GAME_ID"
    });
  }

  const cacheKey = `msn_videos_${gameId}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return res.json({ success: true, source: "cache", data: cached });
  }

  try {
    const data = await msnService.getVideos(gameId);
    cache.set(cacheKey, data);
    res.json({ 
      success: true, 
      source: "api", 
      data: data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route GET /api/msn/personalization
 * @desc Get personalization strip
 * @query {number} lat - Latitude (default: -1.2841)
 * @query {number} long - Longitude (default: 36.8155)
 */
app.get("/api/msn/personalization", async (req, res) => {
  const { lat, long } = req.query;

  const cacheKey = `msn_personalization_${lat || 'default'}_${long || 'default'}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return res.json({ success: true, source: "cache", data: cached });
  }

  try {
    const data = await msnService.getPersonalizationStrip({ 
      lat: lat ? parseFloat(lat) : undefined,
      long: long ? parseFloat(long) : undefined
    });
    cache.set(cacheKey, data);
    res.json({ 
      success: true, 
      source: "api", 
      data: data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route GET /api/search
 * @desc Unified search across all MSN Sports data
 * @query {string} q - Search query (required)
 * @query {string} type - Search type (teams, players, games, all)
 * @query {number} limit - Results limit (default: 20)
 */
app.get("/api/search", async (req, res) => {
  const { q, type = "all", limit = 20 } = req.query;

  if (!q) {
    return res.status(400).json({
      success: false,
      error: "Search query (q) is required",
      usage: "/api/search?q=Toronto&type=teams&limit=10"
    });
  }

  const cacheKey = `search_${q}_${type}_${limit}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return res.json({ success: true, source: "cache", data: cached });
  }

  try {
    const results = {
      teams: [],
      players: [],
      games: [],
      total: 0
    };

    const searchLower = q.toLowerCase();

    // Search in leagues data
    try {
      const leaguesData = await msnService.getLeagues("IceHockey_NHL");
      
      if (leaguesData && leaguesData.teams) {
        results.teams = leaguesData.teams
          .filter(team => 
            team.name?.toLowerCase().includes(searchLower) ||
            team.city?.toLowerCase().includes(searchLower) ||
            team.abbreviation?.toLowerCase().includes(searchLower)
          )
          .slice(0, parseInt(limit));
      }

      if (leaguesData && leaguesData.players) {
        results.players = leaguesData.players
          .filter(player => 
            player.name?.toLowerCase().includes(searchLower) ||
            player.position?.toLowerCase().includes(searchLower)
          )
          .slice(0, parseInt(limit));
      }
    } catch (e) {}

    // Search in live games
    try {
      const gamesData = await msnService.getLiveGames("all", "Basic");
      if (gamesData && gamesData.games) {
        results.games = gamesData.games
          .filter(game =>
            game.home_team?.name?.toLowerCase().includes(searchLower) ||
            game.away_team?.name?.toLowerCase().includes(searchLower) ||
            game.venue?.toLowerCase().includes(searchLower)
          )
          .slice(0, parseInt(limit));
      }
    } catch (e) {}

    results.total = results.teams.length + results.players.length + results.games.length;

    const response = {
      success: true,
      source: "api",
      data: results,
      query: q,
      type: type,
      timestamp: new Date().toISOString()
    };

    cache.set(cacheKey, response);
    res.json(response);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ SYSTEM ENDPOINTS ============

/**
 * @route POST /api/cache/clear
 * @desc Clear all cache
 */
app.post("/api/cache/clear", async (req, res) => {
  cache.flushAll();
  res.json({
    success: true,
    message: "Cache cleared successfully",
    timestamp: new Date().toISOString()
  });
});

/**
 * @route GET /api/cache/stats
 * @desc Get cache statistics
 */
app.get("/api/cache/stats", async (req, res) => {
  res.json({
    success: true,
    stats: cache.getStats(),
    keys: cache.keys(),
    count: cache.keys().length,
    timestamp: new Date().toISOString()
  });
});

/**
 * @route GET /api/health
 * @desc Health check
 */
app.get("/api/health", async (req, res) => {
  res.json({
    status: "healthy",
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    cache: {
      keys: cache.keys().length,
      stats: cache.getStats()
    },
    timestamp: new Date().toISOString()
  });
});

/**
 * @route GET /
 * @desc API documentation
 */
app.get("/", (req, res) => {
  res.json({
    name: "MSN Sports API",
    version: "2.0.0",
    description: "Advanced sports data API using MSN Sports endpoints",
    baseUrl: `http://localhost:${PORT}`,
    endpoints: [
      {
        path: "/api/msn/teamplayers",
        method: "GET",
        description: "Get team players with injuries",
        params: ["teamIds (required)", "scope"],
        example: `/api/msn/teamplayers?teamIds=TEAM_ID_1,TEAM_ID_2&scope=Injuries`
      },
      {
        path: "/api/msn/gamestats",
        method: "GET",
        description: "Get game statistics",
        params: ["gameIds (required)", "scope", "sport", "leagueid"],
        example: `/api/msn/gamestats?gameIds=GAME_ID_1,GAME_ID_2&scope=Playergame`
      },
      {
        path: "/api/msn/schedule",
        method: "GET",
        description: "Get team schedule",
        params: ["teamId (required)", "take"],
        example: `/api/msn/schedule?teamId=TEAM_ID&take=7`
      },
      {
        path: "/api/msn/entityheader",
        method: "GET",
        description: "Get entity header",
        params: ["id (required)", "type"],
        example: `/api/msn/entityheader?id=IceHockey_NHL&type=League`
      },
      {
        path: "/api/msn/livegames",
        method: "GET",
        description: "Get live games",
        params: ["gameIds (required)", "scope"],
        example: `/api/msn/livegames?gameIds=GAME_ID_1,GAME_ID_2&scope=Full`
      },
      {
        path: "/api/msn/standings",
        method: "GET",
        description: "Get standings",
        params: ["teamId (required)", "type"],
        example: `/api/msn/standings?teamId=TEAM_ID&type=division`
      },
      {
        path: "/api/msn/timeline",
        method: "GET",
        description: "Get game timeline (play-by-play)",
        params: ["gameId (required)"],
        example: `/api/msn/timeline?gameId=GAME_ID`
      },
      {
        path: "/api/msn/topplayers",
        method: "GET",
        description: "Get top players for a game",
        params: ["gameId (required)"],
        example: `/api/msn/topplayers?gameId=GAME_ID`
      },
      {
        path: "/api/msn/leagues",
        method: "GET",
        description: "Get league information",
        params: ["leagueIds (required)"],
        example: `/api/msn/leagues?leagueIds=IceHockey_NHL`
      },
      {
        path: "/api/msn/livearoundleague",
        method: "GET",
        description: "Get live around the league",
        params: ["datetime (required)", "id", "sport"],
        example: `/api/msn/livearoundleague?datetime=2025-12-17T04:21:49&id=IceHockey_NHL`
      },
      {
        path: "/api/msn/videos",
        method: "GET",
        description: "Get game videos",
        params: ["gameId (required)"],
        example: `/api/msn/videos?gameId=GAME_ID`
      },
      {
        path: "/api/msn/personalization",
        method: "GET",
        description: "Get personalization strip",
        params: ["lat", "long"],
        example: `/api/msn/personalization?lat=-1.2841&long=36.8155`
      },
      {
        path: "/api/search",
        method: "GET",
        description: "Unified search across all MSN Sports data",
        params: ["q (required)", "type", "limit"],
        example: `/api/search?q=Toronto&type=teams&limit=10`
      }
    ],
    systemEndpoints: [
      { path: "/api/health", method: "GET", description: "Health check" },
      { path: "/api/cache/stats", method: "GET", description: "Cache statistics" },
      { path: "/api/cache/clear", method: "POST", description: "Clear cache" }
    ],
    timestamp: new Date().toISOString()
  });
});

// ============ START SERVER ============
app.listen(PORT, () => {
  console.log(`\n🚀 MSN Sports API v2.0`);
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log(`\n📊 Available endpoints:`);
  console.log(`  - Team Players:   /api/msn/teamplayers`);
  console.log(`  - Game Stats:     /api/msn/gamestats`);
  console.log(`  - Schedule:       /api/msn/schedule`);
  console.log(`  - Live Games:     /api/msn/livegames`);
  console.log(`  - Standings:      /api/msn/standings`);
  console.log(`  - Timeline:       /api/msn/timeline`);
  console.log(`  - Top Players:    /api/msn/topplayers`);
  console.log(`  - Search:         /api/search`);
  console.log(`\n📖 Documentation: http://localhost:${PORT}/\n`);
});
