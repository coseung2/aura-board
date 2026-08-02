use serde::{Deserialize, Deserializer, Serialize};

use crate::{DomainError, DomainResult};

pub const OMOK_BOARD_SIZE: u8 = 15;
const OMOK_CELL_COUNT: usize = OMOK_BOARD_SIZE as usize * OMOK_BOARD_SIZE as usize;

/// Stable logical slots. The UI is free to render each slot with a slime.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OmokSide {
    First,
    Second,
}

impl OmokSide {
    fn opponent(self) -> Self {
        match self {
            Self::First => Self::Second,
            Self::Second => Self::First,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct OmokPosition {
    pub row: u8,
    pub column: u8,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OmokMove {
    pub number: u16,
    pub side: OmokSide,
    pub position: OmokPosition,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    tag = "type"
)]
pub enum OmokCommand {
    PlaceStone {
        side: OmokSide,
        position: OmokPosition,
    },
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case", tag = "status")]
pub enum OmokStatus {
    Playing,
    Won { winner: OmokSide },
    Draw,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OmokState {
    board: Vec<Option<OmokSide>>,
    pub next_turn: OmokSide,
    pub status: OmokStatus,
    pub move_count: u16,
    pub last_move: Option<OmokMove>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OmokStateWire {
    board: Vec<Option<OmokSide>>,
    next_turn: OmokSide,
    status: OmokStatus,
    move_count: u16,
    last_move: Option<OmokMove>,
}

impl<'de> Deserialize<'de> for OmokState {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let wire = OmokStateWire::deserialize(deserializer)?;
        let state = Self {
            board: wire.board,
            next_turn: wire.next_turn,
            status: wire.status,
            move_count: wire.move_count,
            last_move: wire.last_move,
        };
        state.validate().map_err(serde::de::Error::custom)?;
        Ok(state)
    }
}

impl Default for OmokState {
    fn default() -> Self {
        Self::new()
    }
}

impl OmokState {
    pub fn new() -> Self {
        Self {
            board: vec![None; OMOK_CELL_COUNT],
            next_turn: OmokSide::First,
            status: OmokStatus::Playing,
            move_count: 0,
            last_move: None,
        }
    }

    pub fn stone_at(&self, position: OmokPosition) -> DomainResult<Option<OmokSide>> {
        self.validate()?;
        let index = board_index(position)?;
        Ok(self.board[index])
    }

    pub fn apply(&mut self, command: OmokCommand) -> DomainResult<OmokMove> {
        match command {
            OmokCommand::PlaceStone { side, position } => self.place_stone(side, position),
        }
    }

    /// Place one stone under freestyle rules. Five or more contiguous stones win.
    pub fn place_stone(
        &mut self,
        side: OmokSide,
        position: OmokPosition,
    ) -> DomainResult<OmokMove> {
        self.validate()?;
        if self.status != OmokStatus::Playing {
            return Err(DomainError::InvalidPhase);
        }
        if side != self.next_turn {
            return Err(DomainError::WrongParticipant);
        }
        let index = board_index(position)?;
        if self.board[index].is_some() {
            return Err(DomainError::Occupied);
        }

        let game_move = OmokMove {
            number: self.move_count + 1,
            side,
            position,
        };
        self.board[index] = Some(side);
        self.move_count = game_move.number;
        self.last_move = Some(game_move);

        if self.has_five_from(position, side) {
            self.status = OmokStatus::Won { winner: side };
        } else if usize::from(self.move_count) == OMOK_CELL_COUNT {
            self.status = OmokStatus::Draw;
        } else {
            self.next_turn = side.opponent();
        }

        Ok(game_move)
    }

    pub fn validate(&self) -> DomainResult<()> {
        let occupied = self.board.iter().filter(|cell| cell.is_some()).count();
        if self.board.len() != OMOK_CELL_COUNT
            || occupied != usize::from(self.move_count)
            || usize::from(self.move_count) > OMOK_CELL_COUNT
            || (self.status == OmokStatus::Playing && occupied == OMOK_CELL_COUNT)
        {
            return Err(DomainError::InvalidState);
        }

        let first_count = self
            .board
            .iter()
            .filter(|cell| **cell == Some(OmokSide::First))
            .count();
        let second_count = self
            .board
            .iter()
            .filter(|cell| **cell == Some(OmokSide::Second))
            .count();
        if first_count < second_count || first_count > second_count + 1 {
            return Err(DomainError::InvalidState);
        }

        if self.move_count == 0 {
            if self.status != OmokStatus::Playing
                || self.next_turn != OmokSide::First
                || self.last_move.is_some()
            {
                return Err(DomainError::InvalidState);
            }
        } else {
            let last_move = self.last_move.ok_or(DomainError::InvalidState)?;
            if last_move.number != self.move_count
                || board_index(last_move.position)
                    .ok()
                    .and_then(|index| self.board.get(index).copied())
                    != Some(Some(last_move.side))
            {
                return Err(DomainError::InvalidState);
            }

            let expected_last_side = if first_count == second_count + 1 {
                OmokSide::First
            } else if first_count == second_count {
                OmokSide::Second
            } else {
                return Err(DomainError::InvalidState);
            };
            if last_move.side != expected_last_side {
                return Err(DomainError::InvalidState);
            }
        }

        match self.status {
            OmokStatus::Playing => {
                let expected_next_turn = if first_count == second_count {
                    OmokSide::First
                } else {
                    OmokSide::Second
                };
                if self.next_turn != expected_next_turn
                    || self.has_five(OmokSide::First)
                    || self.has_five(OmokSide::Second)
                {
                    return Err(DomainError::InvalidState);
                }
            }
            OmokStatus::Won { winner } => {
                let last_move = self.last_move.ok_or(DomainError::InvalidState)?;
                if self.next_turn != winner
                    || last_move.side != winner
                    || !self.has_five_from(last_move.position, winner)
                    || self.has_five(winner.opponent())
                {
                    return Err(DomainError::InvalidState);
                }
            }
            OmokStatus::Draw => {
                let last_move = self.last_move.ok_or(DomainError::InvalidState)?;
                if occupied != OMOK_CELL_COUNT
                    || self.next_turn != last_move.side
                    || self.has_five(OmokSide::First)
                    || self.has_five(OmokSide::Second)
                {
                    return Err(DomainError::InvalidState);
                }
            }
        }
        Ok(())
    }

    fn has_five(&self, side: OmokSide) -> bool {
        for row in 0..OMOK_BOARD_SIZE {
            for column in 0..OMOK_BOARD_SIZE {
                let position = OmokPosition { row, column };
                if self.board[board_index(position).expect("board position is in bounds")]
                    == Some(side)
                    && self.has_five_from(position, side)
                {
                    return true;
                }
            }
        }
        false
    }

    fn has_five_from(&self, position: OmokPosition, side: OmokSide) -> bool {
        const AXES: [(i16, i16); 4] = [(0, 1), (1, 0), (1, 1), (1, -1)];
        AXES.into_iter().any(|(row_step, column_step)| {
            1 + self.count_direction(position, side, row_step, column_step)
                + self.count_direction(position, side, -row_step, -column_step)
                >= 5
        })
    }

    fn count_direction(
        &self,
        origin: OmokPosition,
        side: OmokSide,
        row_step: i16,
        column_step: i16,
    ) -> u8 {
        let mut count = 0;
        let mut row = i16::from(origin.row) + row_step;
        let mut column = i16::from(origin.column) + column_step;
        let board_size = i16::from(OMOK_BOARD_SIZE);

        while row >= 0 && row < board_size && column >= 0 && column < board_size {
            let index = row as usize * OMOK_BOARD_SIZE as usize + column as usize;
            if self.board[index] != Some(side) {
                break;
            }
            count += 1;
            row += row_step;
            column += column_step;
        }

        count
    }
}

fn board_index(position: OmokPosition) -> DomainResult<usize> {
    if position.row >= OMOK_BOARD_SIZE || position.column >= OMOK_BOARD_SIZE {
        return Err(DomainError::OutOfBounds);
    }
    Ok(position.row as usize * OMOK_BOARD_SIZE as usize + position.column as usize)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn position(row: u8, column: u8) -> OmokPosition {
        OmokPosition { row, column }
    }

    fn place_pair(state: &mut OmokState, first: OmokPosition, second: OmokPosition) {
        state.place_stone(OmokSide::First, first).unwrap();
        state.place_stone(OmokSide::Second, second).unwrap();
    }

    #[test]
    fn starts_empty_with_first_side_to_move() {
        let state = OmokState::new();
        assert_eq!(state.status, OmokStatus::Playing);
        assert_eq!(state.next_turn, OmokSide::First);
        assert_eq!(state.move_count, 0);
        assert!(state.board.iter().all(Option::is_none));
    }

    #[test]
    fn mobile_snapshot_fields_are_camel_case() {
        let state = OmokState::new();
        let value = serde_json::to_value(state).unwrap();
        assert_eq!(value["nextTurn"], "first");
        assert_eq!(value["moveCount"], 0);
        assert!(value.get("next_turn").is_none());
    }

    #[test]
    fn canonical_json_round_trips_a_recovered_state() {
        let mut state = OmokState::new();
        state.place_stone(OmokSide::First, position(7, 7)).unwrap();
        let value = serde_json::to_value(&state).unwrap();
        assert_eq!(value["nextTurn"], "second");
        assert_eq!(value["lastMove"]["number"], 1);
        assert!(value.get("last_move").is_none());

        let recovered: OmokState = serde_json::from_value(value).unwrap();
        assert_eq!(recovered, state);
    }

    #[test]
    fn rejects_an_invalid_recovered_state_before_commands_run() {
        let mut value = serde_json::to_value(OmokState::new()).unwrap();
        value["moveCount"] = serde_json::json!(1);
        assert!(serde_json::from_value::<OmokState>(value).is_err());
    }

    #[test]
    fn detects_horizontal_five() {
        let mut state = OmokState::new();
        for column in 0..4 {
            place_pair(&mut state, position(7, column), position(0, column));
        }
        state.place_stone(OmokSide::First, position(7, 4)).unwrap();
        assert_eq!(
            state.status,
            OmokStatus::Won {
                winner: OmokSide::First
            }
        );
    }

    #[test]
    fn detects_vertical_five() {
        let mut state = OmokState::new();
        for row in 0..4 {
            place_pair(&mut state, position(row, 7), position(row, 0));
        }
        state.place_stone(OmokSide::First, position(4, 7)).unwrap();
        assert!(matches!(state.status, OmokStatus::Won { .. }));
    }

    #[test]
    fn detects_both_diagonal_axes() {
        for columns in [[3, 4, 5, 6, 7], [11, 10, 9, 8, 7]] {
            let mut state = OmokState::new();
            for row in 0..4 {
                place_pair(
                    &mut state,
                    position(row, columns[row as usize]),
                    position(row, 14),
                );
            }
            state
                .place_stone(OmokSide::First, position(4, columns[4]))
                .unwrap();
            assert!(matches!(state.status, OmokStatus::Won { .. }));
        }
    }

    #[test]
    fn freestyle_overline_is_a_win() {
        let mut state = OmokState::new();
        for (first_column, second_column) in [(0, 0), (1, 2), (2, 4), (4, 6), (5, 8)] {
            place_pair(
                &mut state,
                position(5, first_column),
                position(0, second_column),
            );
        }

        state.place_stone(OmokSide::First, position(5, 3)).unwrap();
        assert!(matches!(state.status, OmokStatus::Won { .. }));
    }

    #[test]
    fn rejected_commands_leave_state_unchanged() {
        let mut state = OmokState::new();
        let before_wrong_turn = state.clone();
        assert_eq!(
            state.place_stone(OmokSide::Second, position(7, 7)),
            Err(DomainError::WrongParticipant)
        );
        assert_eq!(state, before_wrong_turn);

        assert_eq!(
            state.place_stone(OmokSide::First, position(15, 0)),
            Err(DomainError::OutOfBounds)
        );
        assert_eq!(state, before_wrong_turn);

        state.place_stone(OmokSide::First, position(7, 7)).unwrap();
        let before_occupied = state.clone();
        assert_eq!(
            state.place_stone(OmokSide::Second, position(7, 7)),
            Err(DomainError::Occupied)
        );
        assert_eq!(state, before_occupied);
    }

    #[test]
    fn rejects_a_corrupt_recovered_board_without_panicking_or_mutating() {
        let mut state = OmokState::new();
        state.board.pop();
        let corrupt = state.clone();

        assert_eq!(
            state.apply(OmokCommand::PlaceStone {
                side: OmokSide::First,
                position: position(0, 0),
            }),
            Err(DomainError::InvalidState)
        );
        assert_eq!(state, corrupt);
    }

    #[test]
    fn rejects_moves_after_a_win() {
        let mut state = OmokState::new();
        for column in 0..4 {
            place_pair(&mut state, position(7, column), position(0, column));
        }
        state.place_stone(OmokSide::First, position(7, 4)).unwrap();
        let finished = state.clone();
        assert_eq!(
            state.place_stone(OmokSide::Second, position(1, 1)),
            Err(DomainError::InvalidPhase)
        );
        assert_eq!(state, finished);
    }

    #[test]
    fn a_full_board_without_five_is_a_draw() {
        let mut state = OmokState::new();
        let last = position(14, 13);
        for row in 0..OMOK_BOARD_SIZE {
            for column in 0..OMOK_BOARD_SIZE {
                let current = position(row, column);
                if current == last {
                    continue;
                }
                let side = if (row + column / 2) % 2 == 0 {
                    OmokSide::First
                } else {
                    OmokSide::Second
                };
                let index = board_index(current).unwrap();
                state.board[index] = Some(side);
            }
        }
        state.move_count = (OMOK_CELL_COUNT - 1) as u16;
        state.next_turn = OmokSide::First;
        state.last_move = Some(OmokMove {
            number: state.move_count,
            side: OmokSide::Second,
            position: position(14, 11),
        });
        assert!(!state.has_five(OmokSide::First));
        assert!(!state.has_five(OmokSide::Second));

        state.place_stone(state.next_turn, last).unwrap();
        assert_eq!(state.status, OmokStatus::Draw);
    }
}
