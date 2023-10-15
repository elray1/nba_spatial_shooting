from pathlib import Path
import pandas as pd
from nba_api.stats.static import teams
from nba_api.stats.endpoints import leaguegamefinder
from nba_api.stats.endpoints import boxscoreadvancedv2
from nba_api.stats.endpoints import shotchartdetail

# look up celtics team id
celtics_info = teams.find_teams_by_city('boston')[0]
celtics_id = celtics_info['id']

# regular season games where the Celtics were playing
gamefinder = leaguegamefinder.LeagueGameFinder(
  team_id_nullable=celtics_id,
  season_nullable='2022-23',
  season_type_nullable='Regular Season')
games = gamefinder.get_data_frames()[0]

# celtics players who played last season
game_players = pd.concat(
  [
    boxscoreadvancedv2 \
      .BoxScoreAdvancedV2(game_id=game_id) \
      .get_data_frames()[0] \
      .query('TEAM_ABBREVIATION == "BOS" and MIN.notnull()') \
      [['PLAYER_ID', 'PLAYER_NAME']] \
    for game_id in games.GAME_ID],
  axis = 0)
game_players.columns = game_players.columns.str.lower()

game_players['player_name'].value_counts()

players_to_fetch = game_players[['player_id', 'player_name']].value_counts() \
  .reset_index() \
  .set_axis(['player_id', 'player_name', 'n_games'], axis='columns') \
  .query('n_games > 30')

players_to_fetch

# shot level data for the selected players
shot_data = pd.concat(
  [
    shotchartdetail.ShotChartDetail(
      team_id=celtics_id,
      player_id=player_id,
      context_measure_simple='FGA',
      season_nullable='2022-23',
      season_type_all_star='Regular Season').get_data_frames()[0] \
    for player_id in players_to_fetch['player_id']
  ],
  axis=0)
shot_data.columns = shot_data.columns.str.lower()

Path('data').mkdir(parents=True, exist_ok=True)
shot_data.to_csv('data/shots.csv')
