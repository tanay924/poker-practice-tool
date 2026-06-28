// Headless NDJSON worker for Shark v2.6.0.
//
// This file is copied into the pinned Shark source tree by
// tools/setup_shark_worker.ps1 and compiled with Shark's solver sources.
#include "hands/PreflopRange.hh"
#include "hands/PreflopRangeManager.hh"
#include "solver/Solver.hh"
#include "tree/GameTree.hh"
#include "tree/Nodes.hh"
#include "trainer/DCFR.hh"
#include "card.h"
#include "nlohmann/json.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <iostream>
#include <memory>
#include <numeric>
#include <sstream>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>

using json = nlohmann::json;
using phevaluator::Card;

namespace {

constexpr const char *WORKER_VERSION = "v2.6.0";
constexpr const char *WORKER_COMMIT = "c9dc07d";

struct HistoryStep {
  const ActionNode *node;
  int action_index;
};

struct SolvedTree {
  std::unique_ptr<Node> root;
  PreflopRangeManager range_manager;
  std::vector<Card> flop_board;
  int starting_pot;
};

std::unordered_map<std::string, std::shared_ptr<SolvedTree>> solved_tree_cache;

std::vector<Card> parse_board(const json &cards, size_t count) {
  if (!cards.is_array() || cards.size() < count) {
    throw std::runtime_error("board does not contain enough cards");
  }
  std::vector<Card> board;
  for (size_t i = 0; i < count; ++i) {
    board.emplace_back(cards.at(i).get<std::string>().c_str());
  }
  return board;
}

std::string format_amount(int amount) {
  return std::to_string(amount) + "bb";
}

std::string action_label(const Action &action) {
  switch (action.type) {
  case Action::FOLD:
    return "fold";
  case Action::CHECK:
    return "check";
  case Action::CALL:
    return "call " + format_amount(action.amount);
  case Action::BET:
    return "bet " + format_amount(action.amount);
  case Action::RAISE:
    return "raise to " + format_amount(action.amount);
  }
  return "unknown";
}

std::vector<std::string> action_labels(const ActionNode *node, const std::string &street) {
  std::vector<std::string> labels;
  (void)street;
  for (const auto &action : node->get_actions()) {
    labels.push_back(action_label(action));
  }
  return labels;
}

bool amount_matches(int actual, const json &entry, const std::string &field) {
  if (!entry.contains(field) || entry.at(field).is_null()) {
    return true;
  }
  const double expected = entry.at(field).get<double>();
  return std::fabs(static_cast<double>(actual) - expected) <= 0.51;
}

bool action_matches_entry(const Action &action, const json &entry) {
  const std::string wanted = entry.value("action", "");
  switch (action.type) {
  case Action::FOLD:
    return wanted == "fold";
  case Action::CHECK:
    return wanted == "check";
  case Action::CALL:
    return wanted == "call" && amount_matches(action.amount, entry, "amount_bb");
  case Action::BET:
    return wanted == "bet" && amount_matches(action.amount, entry, "amount_bb");
  case Action::RAISE:
    return wanted == "raise_to" && amount_matches(action.amount, entry, "target_amount_bb");
  }
  return false;
}

std::string describe_action_entry(const json &entry) {
  const std::string action = entry.value("action", "");
  std::ostringstream out;
  out << action;
  if (action == "raise_to" && entry.contains("target_amount_bb")) {
    out << " " << entry.at("target_amount_bb").get<double>() << "bb";
  } else if (entry.contains("amount_bb") && entry.at("amount_bb").get<double>() > 0.0) {
    out << " " << entry.at("amount_bb").get<double>() << "bb";
  }
  return out.str();
}

int find_action_index(const ActionNode *node, const json &entry) {
  const auto &actions = node->get_actions();
  for (size_t i = 0; i < actions.size(); ++i) {
    if (action_matches_entry(actions[i], entry)) {
      return static_cast<int>(i);
    }
  }
  return -1;
}

bool combo_overlaps_board(const PreflopCombo &combo, const std::vector<Card> &board) {
  for (const auto &card : board) {
    if (combo.hand1 == card || combo.hand2 == card) {
      return true;
    }
  }
  return false;
}

std::vector<float> compute_reach(
    const PreflopRangeManager &range_manager,
    const std::vector<HistoryStep> &history,
    int player) {
  const auto &hands = range_manager.get_preflop_combos(player);
  std::vector<float> reach(hands.size(), 1.0f);

  for (const auto &step : history) {
    if (step.node->get_player() != player) {
      continue;
    }
    const auto strategy = step.node->get_average_strat();
    const size_t num_hands = strategy.size() / step.node->get_num_actions();
    for (size_t hand = 0; hand < reach.size() && hand < num_hands; ++hand) {
      const size_t index = hand + static_cast<size_t>(step.action_index) * num_hands;
      if (index < strategy.size()) {
        reach[hand] *= strategy[index];
      }
    }
  }
  return reach;
}

json overall_strategy(
    const PreflopRangeManager &range_manager,
    const ActionNode *node,
    const std::vector<HistoryStep> &history,
    const std::vector<Card> &board,
    const std::string &street) {
  const auto &hands = range_manager.get_preflop_combos(node->get_player());
  const auto strategy = node->get_average_strat();
  const auto labels = action_labels(node, street);
  const auto reach = compute_reach(range_manager, history, node->get_player());
  const size_t num_hands = hands.size();
  std::vector<float> totals(labels.size(), 0.0f);
  int valid_hands = 0;

  for (size_t hand = 0; hand < num_hands; ++hand) {
    if (combo_overlaps_board(hands[hand], board) || reach[hand] < 0.001f) {
      continue;
    }
    for (size_t action = 0; action < labels.size(); ++action) {
      const size_t index = hand + action * num_hands;
      if (index < strategy.size()) {
        totals[action] += strategy[index];
      }
    }
    ++valid_hands;
  }

  if (valid_hands > 0) {
    for (auto &value : totals) {
      value /= static_cast<float>(valid_hands);
    }
  }

  const float sum = std::accumulate(totals.begin(), totals.end(), 0.0f);
  json result = json::object();
  for (size_t i = 0; i < labels.size(); ++i) {
    const float value = sum > 0.0f ? totals[i] / sum : 1.0f / static_cast<float>(labels.size());
    result[labels[i]] = value;
  }
  return result;
}

std::shared_ptr<SolvedTree> solve_tree(const json &solver_input, const json &settings, bool &cache_hit) {
  const json &ranges = solver_input.at("ranges").at("shark_ranges");
  const std::string cache_key = json{
      {"board", solver_input.at("board")},
      {"ranges", ranges},
      {"settings", settings},
      {"stack_bb", solver_input.value("stack_bb", 100)},
  }.dump();

  auto cached = solved_tree_cache.find(cache_key);
  if (cached != solved_tree_cache.end()) {
    cache_hit = true;
    return cached->second;
  }
  cache_hit = false;

  PreflopRange bb_oop_range{ranges.at("bb_call_vs_open").get<std::string>()};
  PreflopRange sb_ip_range{ranges.at("sb_open").get<std::string>()};
  std::vector<Card> flop_board = parse_board(solver_input.at("board"), 3);

  int starting_pot = 5;
  for (const auto &entry : solver_input.at("action_history")) {
    if (entry.value("street", "") == "preflop" && entry.value("actor", "") == "BB" &&
        entry.value("action", "") == "call") {
      starting_pot = static_cast<int>(std::round(entry.value("pot_after", 5.0)));
    }
  }

  const int stack = solver_input.value("stack_bb", 100);
  const int min_bet = 2;
  TreeBuilderSettings tree_settings{
      bb_oop_range,
      sb_ip_range,
      2,
      flop_board,
      stack,
      starting_pot,
      min_bet,
      settings.value("all_in_threshold", 0.67f)};
  tree_settings.remove_donk_bets = settings.value("force_donk_check", true);
  tree_settings.raise_cap = 3;
  if (!settings.value("postflop_raises_enabled", false)) {
    tree_settings.bet_sizing.flop.raise_sizes.clear();
    tree_settings.bet_sizing.turn.raise_sizes.clear();
    tree_settings.bet_sizing.river.raise_sizes.clear();
  }
  DCFR::compress_strategy = true;

  auto solved = std::make_shared<SolvedTree>();
  solved->flop_board = flop_board;
  solved->starting_pot = starting_pot;
  solved->range_manager = PreflopRangeManager{
      bb_oop_range.preflop_combos,
      sb_ip_range.preflop_combos,
      flop_board};

  GameTree game_tree{tree_settings};
  solved->root = game_tree.build();

  ParallelDCFR trainer{
      solved->range_manager,
      flop_board,
      starting_pot,
      min_bet,
      settings.value("thread_count", 1)};
  trainer.train(
      solved->root.get(),
      settings.value("iterations", 100),
      settings.value("min_exploitability_pct", 0.1f),
      nullptr);

  solved_tree_cache[cache_key] = solved;
  return solved;
}

std::vector<Card> board_for_street(const json &all_board, const std::string &street) {
  if (street == "flop") {
    return parse_board(all_board, 3);
  }
  if (street == "turn") {
    return parse_board(all_board, 4);
  }
  return parse_board(all_board, 5);
}

json analyze_hand(const json &message) {
  const auto started = std::chrono::steady_clock::now();
  const json &solver_input = message.at("solver_input");
  const json &settings = message.at("settings");
  bool tree_cache_hit = false;
  auto solved = solve_tree(solver_input, settings, tree_cache_hit);

  Node *current = solved->root.get();
  std::vector<HistoryStep> history;
  json street_results = json::array();

  for (const auto &entry : solver_input.at("action_history")) {
    const std::string street = entry.value("street", "");
    if (street == "preflop") {
      continue;
    }

    const auto current_board = board_for_street(solver_input.at("board"), street);
    while (current && current->get_node_type() == NodeType::CHANCE_NODE) {
      auto *chance = dynamic_cast<ChanceNode *>(current);
      const size_t card_index = current_board.size() - 1;
      Card next_card{solver_input.at("board").at(card_index).get<std::string>().c_str()};
      current = chance->get_child(static_cast<int>(next_card));
    }

    if (!current || current->get_node_type() != NodeType::ACTION_NODE) {
      throw std::runtime_error("action history reached a non-action node");
    }

    auto *action_node = dynamic_cast<ActionNode *>(current);
    const int action_index = find_action_index(action_node, entry);
    if (action_index < 0) {
      throw std::runtime_error("action is not available in Shark tree: " + describe_action_entry(entry));
    }
    const std::string action = action_label(action_node->get_actions()[action_index]);

    const std::string actor = entry.value("actor", "");
    const bool is_hero_sb = actor == "SB" || actor == "hero";
    if (is_hero_sb && action_node->get_player() == 2) {
      json strategy = overall_strategy(
          solved->range_manager,
          action_node,
          history,
          current_board,
          street);
      std::string best_action;
      double best_frequency = -1.0;
      for (auto it = strategy.begin(); it != strategy.end(); ++it) {
        const double frequency = it.value().get<double>();
        if (frequency > best_frequency) {
          best_frequency = frequency;
          best_action = it.key();
        }
      }
      const double hero_frequency = strategy.value(action, 0.0);
      const std::string verdict = action == best_action ? "preferred" : hero_frequency >= 0.25 ? "mixed" : "mistake";

      street_results.push_back({
          {"street", street},
          {"node", entry.value("node", "SB " + street + " decision")},
          {"hero_hand", solver_input.value("hero_cards", "")},
          {"board", solver_input.at("board")},
          {"solver_strategy", strategy},
          {"hero_action", action},
          {"best_action", best_action},
          {"verdict", verdict},
          {"confidence", best_frequency >= 0.55 ? "high" : "medium"},
      });
    }

    history.push_back({action_node, action_index});
    current = action_node->get_child(action_index);
  }

  json largest_mistake = nullptr;
  for (const auto &result : street_results) {
    if (result.value("verdict", "") == "mistake") {
      largest_mistake = {
          {"street", result.at("street")},
          {"node", result.at("node")},
          {"hero_action", result.at("hero_action")},
          {"best_action", result.at("best_action")},
      };
      break;
    }
  }

  const auto ended = std::chrono::steady_clock::now();
  const double duration = std::chrono::duration<double>(ended - started).count();
  return {
      {"street_results", street_results},
      {"summary", {
          {"overall", largest_mistake.is_null() ? "mixed" : "needs_review"},
          {"largest_mistake", largest_mistake},
      }},
      {"metadata", {
          {"solver", {{"name", "shark"}, {"version", WORKER_VERSION}, {"commit", WORKER_COMMIT}}},
          {"duration_seconds", duration},
          {"tree_cache_hit", tree_cache_hit},
      }},
  };
}

void write_response(const json &response) {
  std::cout << response.dump() << std::endl;
}

} // namespace

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    try {
      const json message = json::parse(line);
      const std::string type = message.value("type", "");

      if (type == "version") {
        write_response({{"ok", true}, {"type", "version"}, {"version", WORKER_VERSION}, {"commit", WORKER_COMMIT}});
      } else if (type == "health") {
        write_response({{"ok", true}, {"type", "health"}});
      } else if (type == "analyze_hand") {
        write_response({{"ok", true}, {"type", "analysis"}, {"result", analyze_hand(message)}});
      } else if (type == "shutdown") {
        write_response({{"ok", true}, {"type", "shutdown"}});
        break;
      } else {
        write_response({{"ok", false}, {"type", type}, {"status", "unsupported"}, {"error", "unknown worker message type"}});
      }
    } catch (const std::exception &error) {
      write_response({{"ok", false}, {"type", "analysis"}, {"status", "unsupported"}, {"error", error.what()}});
    }
  }
  return 0;
}
